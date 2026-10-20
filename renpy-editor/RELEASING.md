# Cómo publicar una versión nueva del editor

Los editores instalados buscan versiones nuevas en las **GitHub Releases** de
[Thander11/NovelBlocks](https://github.com/Thander11/NovelBlocks/releases),
las descargan solos y se actualizan al reiniciar.

## Una sola vez

1. Crea un token de GitHub: <https://github.com/settings/tokens> → *Fine-grained token*,
   solo para el repositorio `NovelBlocks`, con permiso **Contents: Read and write**.
2. Guárdalo como variable de entorno `GH_TOKEN` (en Windows: *Editar las variables de
   entorno de esta cuenta* → Nueva → `GH_TOKEN`). No lo pongas nunca en un archivo del proyecto.
3. Asegúrate de que `report.config.json` existe en la carpeta del editor (ver
   `report.config.example.json`): se incluye dentro del instalador.

## Cada versión

1. Sube el número de `"version"` en `package.json` (por ejemplo, de `1.0.0` a `1.1.0`).
   Los editores instalados solo se actualizan a un número mayor que el suyo.
2. Haz commit de los cambios.
3. Ejecuta:

   ```bash
   npm run release
   ```

   Compila el instalador de Windows y lo sube, con `latest.yml`, a un **borrador** de
   release en GitHub.
4. En GitHub → *Releases*, revisa el borrador, escribe qué ha cambiado y pulsa
   **Publish release**. Desde ese momento, los editores instalados la encontrarán.

Para compilar sin publicar (por ejemplo, para probar el instalador): `npm run dist`.
El resultado queda en `dist/`.

## A tener en cuenta

- El instalador no está firmado, así que la primera vez Windows puede mostrar
  «Windows protegió tu PC»: hay que pulsar *Más información → Ejecutar de todas formas*.
  Las actualizaciones posteriores funcionan sin ese aviso.
- Si `npm run dist` falla en Windows con «Cannot create symbolic link», es el paquete de
  herramientas de firma de electron-builder: hay que descomprimirlo a mano en
  `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0` (las dos
  bibliotecas de Mac que fallan no hacen falta en Windows).
