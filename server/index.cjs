const path = require('path');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs-extra');
const archiver = require('archiver');

const FBXToVRMAConverter = require('../fbx2vrma-converter');
const { getDefaultBinaryName } = require('../fbx2vrma-converter');

const app = express();
const projectRoot = path.resolve(__dirname, '..');
const converterRoot = path.join(projectRoot, 'fbx2vrma-converter');
const distDir = path.join(projectRoot, 'dist');
const workRoot = path.join(os.tmpdir(), 'fbx2vrma-web');

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';
const maxFiles = Number(process.env.MAX_FILES || 10);
const maxFileSizeMb = Number(process.env.MAX_FILE_SIZE_MB || 100);
const maxFileSizeBytes = maxFileSizeMb * 1024 * 1024;
const defaultFramerate = '30';

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  exposedHeaders: ['Content-Disposition', 'X-Conversion-Count'],
}));
app.use(express.json({ limit: '1mb' }));

function createJobDir(req) {
  if (!req.jobDir) {
    const jobId = crypto.randomUUID();
    req.jobDir = path.join(workRoot, jobId);
    req.uploadDir = path.join(req.jobDir, 'uploads');
    req.outputDir = path.join(req.jobDir, 'outputs');
    fs.ensureDirSync(req.uploadDir);
    fs.ensureDirSync(req.outputDir);
  }

  return req.uploadDir;
}

function sanitizeBaseName(name) {
  const parsed = path.parse(name);
  const normalized = parsed.name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);

  return normalized || `animation-${Date.now()}`;
}

function createUniqueName(originalName, usedNames) {
  const baseName = sanitizeBaseName(originalName);
  const count = usedNames.get(baseName) || 0;
  usedNames.set(baseName, count + 1);
  return count === 0 ? baseName : `${baseName}-${count + 1}`;
}

const upload = multer({
  storage: multer.diskStorage({
    destination(req, _file, cb) {
      cb(null, createJobDir(req));
    },
    filename(_req, file, cb) {
      cb(null, `${sanitizeBaseName(file.originalname)}-${crypto.randomUUID()}.fbx`);
    },
  }),
  limits: {
    fileSize: maxFileSizeBytes,
    files: maxFiles,
  },
  fileFilter(_req, file, cb) {
    if (path.extname(file.originalname).toLowerCase() !== '.fbx') {
      cb(new Error('Only .fbx files are supported.'));
      return;
    }
    cb(null, true);
  },
});

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function resolveFbx2gltfPath() {
  return path.join(converterRoot, process.env.FBX2GLTF_PATH || getDefaultBinaryName());
}

function collectUploadedFiles(req) {
  if (Array.isArray(req.files)) {
    return req.files;
  }

  if (!req.files) {
    return [];
  }

  return Object.values(req.files).flat();
}

async function sendFileAndCleanup(res, filePath, downloadName, jobDir) {
  res.download(filePath, downloadName, async (error) => {
    await fs.remove(jobDir);
    if (error && !res.headersSent) {
      res.status(500).json({ error: 'Failed to send converted file.' });
    }
  });
}

async function sendZipAndCleanup(res, convertedFiles, failures, jobDir) {
  const zipName = `vrma-batch-${Date.now()}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
  res.setHeader('X-Conversion-Count', String(convertedFiles.length));
  res.on('finish', () => {
    fs.remove(jobDir).catch(() => {});
  });
  res.on('close', () => {
    fs.remove(jobDir).catch(() => {});
  });

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', async (error) => {
    await fs.remove(jobDir);
    res.destroy(error);
  });
  archive.pipe(res);

  for (const file of convertedFiles) {
    archive.file(file.path, { name: file.downloadName });
  }

  if (failures.length > 0) {
    archive.append(
      JSON.stringify({
        converted: convertedFiles.map((file) => file.downloadName),
        failed: failures,
      }, null, 2),
      { name: 'conversion-report.json' },
    );
  }

  await archive.finalize();
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  const binaryPath = resolveFbx2gltfPath();
  const binaryExists = await fs.pathExists(binaryPath);
  const binaryStat = binaryExists ? await fs.stat(binaryPath) : null;

  res.json({
    ok: true,
    binary: {
      name: path.basename(binaryPath),
      path: binaryPath,
      exists: Boolean(binaryStat?.size),
      size: binaryStat?.size || 0,
    },
    limits: {
      maxFiles,
      maxFileSizeMb,
    },
  });
}));

app.post(
  '/api/convert',
  upload.fields([
    { name: 'files', maxCount: maxFiles },
    { name: 'file', maxCount: maxFiles },
  ]),
  asyncRoute(async (req, res) => {
    const files = collectUploadedFiles(req);
    if (files.length === 0) {
      await fs.remove(req.jobDir);
      res.status(400).json({ error: 'Upload at least one .fbx file.' });
      return;
    }

    await fs.ensureDir(req.outputDir);

    const framerateValue = String(req.body.framerate || defaultFramerate);
    const framerate = /^\d+$/.test(framerateValue) ? framerateValue : defaultFramerate;
    const fbx2gltfPath = resolveFbx2gltfPath();
    const converter = new FBXToVRMAConverter();
    const convertedFiles = [];
    const failures = [];
    const usedNames = new Map();

    for (const file of files) {
      const uniqueBaseName = createUniqueName(file.originalname, usedNames);
      const outputPath = path.join(req.outputDir, `${uniqueBaseName}.vrma`);
      const ok = await converter.convert(file.path, outputPath, fbx2gltfPath, framerate);

      if (ok && await fs.pathExists(outputPath)) {
        convertedFiles.push({
          path: outputPath,
          downloadName: `${uniqueBaseName}.vrma`,
        });
      } else {
        failures.push(file.originalname);
      }
    }

    if (convertedFiles.length === 0) {
      await fs.remove(req.jobDir);
      res.status(422).json({
        error: 'Conversion failed.',
        failedFiles: failures,
        hint: 'Check that FBX2glTF is installed and the FBX contains humanoid animation data.',
      });
      return;
    }

    if (files.length === 1 && convertedFiles.length === 1) {
      res.setHeader('X-Conversion-Count', '1');
      await sendFileAndCleanup(res, convertedFiles[0].path, convertedFiles[0].downloadName, req.jobDir);
      return;
    }

    await sendZipAndCleanup(res, convertedFiles, failures, req.jobDir);
  }),
);

app.use((error, req, res, _next) => {
  fs.remove(req.jobDir).catch(() => {});

  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: error.message || 'Unexpected server error.' });
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(port, host, () => {
  console.log(`FBX2VRMA web server listening on http://${host}:${port}`);
});
