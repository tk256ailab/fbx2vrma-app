# FBX2VRMA Web App

[日本語](README-jp.md)

FBX2VRMA Web App is a browser-based tool for converting humanoid FBX animation files to `.vrma` and previewing the result on a VRM model.

The conversion engine is provided by the local `fbx2vrma-converter/` package. The web app itself lives at the repository root.

## Features

- Convert one or more `.fbx` files to `.vrma`
- Preview each converted animation individually
- Download each `.vrma` file, or download all converted files as a ZIP
- Switch the interface between English and Japanese
- Preview with the bundled sample model at `public/vrm/Sample.vrm`
- Upload a custom `.vrm`, `.glb`, or `.gltf` model for preview
- Keep uploaded FBX files and generated VRMA files only in temporary server storage during conversion

## Architecture

- Frontend: React, Vite, Three.js, `@pixiv/three-vrm`, and `@pixiv/three-vrm-animation`
- Backend: Express API with temporary file uploads
- Converter: local `fbx2vrma-converter/` package
- Native dependency: FBX2glTF, downloaded by `npm run setup`

Because conversion requires Node.js file handling and a native FBX2glTF executable, this app should be deployed as a dynamic web service. Static hosting alone, such as GitHub Pages or Cloudflare Pages by themselves, cannot run the conversion API.

## Requirements

- Node.js 18 or newer for local development
- Docker for Render-style production builds
- A humanoid FBX animation file for conversion

## Local Development

Install dependencies and download the platform-specific FBX2glTF binary:

```bash
npm install
npm run setup
```

Start the API server:

```bash
npm run api
```

In another terminal, start the Vite dev server:

```bash
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` to `http://localhost:8787`.

## Production Locally

```bash
npm run build
npm start
```

Open `http://localhost:8787`.

## Docker

Build and run the production image:

```bash
docker build -t fbx2vrma-app .
docker run --rm -p 8787:10000 fbx2vrma-app
```

Open `http://localhost:8787`.

## Deploying to Render

This repository is configured for a single Render Web Service using Docker:

- `Dockerfile` builds the frontend, downloads the Linux FBX2glTF binary, and starts the Express server.
- `server/index.cjs` listens on `0.0.0.0` and uses the `PORT` environment variable.
- `render.yaml` defines a free Docker web service with `/api/health` as the health check path.

Deployment steps:

1. Push this repository to GitHub.
2. Make sure `fbx2vrma-converter/` is included in the repository contents, not left as an unconfigured nested Git repository.
3. In Render, create a new Web Service or Blueprint from the GitHub repository.
4. Select Docker as the runtime if you create the Web Service manually.
5. Leave the Dockerfile path as `./Dockerfile` and the Docker context as `.`.
6. Deploy the service and wait for the first build to complete.
7. Open the generated `https://your-service-name.onrender.com` URL.
8. Check `https://your-service-name.onrender.com/api/health` if you need to confirm the converter binary was installed.

Optional environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `10000` in Docker, `8787` locally | HTTP server port |
| `HOST` | `0.0.0.0` | HTTP server host |
| `MAX_FILES` | `10` | Maximum number of FBX files per request |
| `MAX_FILE_SIZE_MB` | `100` | Maximum upload size per FBX file |
| `CORS_ORIGIN` | `*` | Allowed CORS origin. Usually not needed when frontend and API are served from the same Render service. |
| `FBX2GLTF_PATH` | platform default | Custom path to the FBX2glTF executable |

## Custom Domain

After the Render service is working on its `.onrender.com` URL, add your subdomain in the Render dashboard and create the DNS record requested by Render at your DNS provider, such as Cloudflare. Keep the Render service as the origin for both the frontend and API.

## Notes

- Render Free web services can spin down after idle periods, so the first request after inactivity may take longer.
- Render Free web services use ephemeral storage. This is acceptable for this app because files are temporary and are deleted after each conversion response.
- Large FBX files can be slow to upload, convert, and preview. Increase `MAX_FILE_SIZE_MB` only if your Render plan has enough memory and CPU for the workload.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
