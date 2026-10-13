# Ren'Py EDITOR — runs RAPT (Ren'Py's Android packaging tool) without
# questions on the console: the editor asks the user first (for example,
# to accept the Android SDK terms) and reads progress as JSON lines.
#
#   python android-helper.py install_sdk <rapt directory>
#
# It runs with the Python that comes with Ren'Py, with JAVA_HOME pointing at
# the JDK and RAPT_NO_TERMS set once the user accepted the terms in the editor.

import json
import os
import sys


def emit(kind, text="", **extra):
    extra.update(type=kind, text=text)
    sys.stdout.write(json.dumps(extra) + "\n")
    sys.stdout.flush()


def main():
    command, rapt_dir = sys.argv[1], sys.argv[2]
    sys.path.insert(0, os.path.join(rapt_dir, "buildlib"))

    import rapt.plat
    import rapt.interface

    class EditorInterface(rapt.interface.Interface):

        def write(self, s, style=""):
            emit("info", s)

        def info(self, prompt):
            emit("info", prompt)

        def success(self, prompt):
            emit("info", prompt)

        def final_success(self, prompt):
            emit("done", prompt)

        def fail(self, prompt):
            emit("fail", prompt.replace("[JDK_REQUIREMENT]", str(rapt.plat.jdk_requirement)))
            sys.exit(1)

        # The editor already asked: every question is answered as the user did there
        def yesno(self, prompt):
            return True

        def yesno_choice(self, prompt, default=None):
            return True if default is None else default

        def terms(self, url, prompt):
            return True

        def input(self, prompt, empty=None):  # @ReservedAssignment
            return empty

        def choice(self, prompt, choices, default=None):
            return default if default is not None else choices[0][0]

        def download(self, url, dest):
            import requests
            emit("info", "Downloading " + url.rsplit("/", 1)[-1])
            with requests.get(url, stream=True, timeout=60) as resp:
                resp.raise_for_status()
                total = int(resp.headers.get("content-length") or 0)
                done = 0
                last = -1
                with open(dest, "wb") as f:
                    for chunk in resp.iter_content(1 << 16):
                        f.write(chunk)
                        done += len(chunk)
                        percent = int(done * 100 / total) if total else -1
                        if percent != last:
                            last = percent
                            emit("progress", "", done=done, total=total)

    iface = EditorInterface()

    if command == "install_sdk":
        import rapt.install_sdk
        rapt.install_sdk.install_sdk(iface)
    else:
        emit("fail", "Unknown command: " + command)
        sys.exit(2)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        emit("fail", "%s: %s" % (type(e).__name__, e))
        sys.exit(1)
