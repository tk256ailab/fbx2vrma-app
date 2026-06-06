import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  Activity,
  AlertCircle,
  Archive,
  CheckCircle2,
  Download,
  Eye,
  FileArchive,
  Files,
  Languages,
  LoaderCircle,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import PreviewPanel from './PreviewPanel.jsx';
import { dictionaries } from './i18n.js';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const defaultLimits = {
  maxFiles: 10,
  maxFileSizeMb: 100,
};
const repositoryLinks = [
  {
    href: 'https://github.com/tk256ailab/fbx2vrma-app',
    label: 'fbx2vrma-app',
  },
  {
    href: 'https://github.com/tk256ailab/fbx2vrma-converter',
    label: 'fbx2vrma-converter',
  },
];

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unit = units.shift();
  while (size >= 1024 && units.length > 0) {
    size /= 1024;
    unit = units.shift();
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${unit}`;
}

function parseDownloadName(headers, fallback) {
  const disposition = headers.get('Content-Disposition') || '';
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    return decodeURIComponent(utf8Match[1]);
  }

  const asciiMatch = disposition.match(/filename="?([^"]+)"?/i);
  return asciiMatch?.[1] || fallback;
}

function makeFileItem(file) {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
    file,
  };
}

function GitHubIcon({ size = 15 }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      focusable="false"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.86c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export default function App() {
  const [language, setLanguage] = useState('en');
  const [files, setFiles] = useState([]);
  const [framerate, setFramerate] = useState('30');
  const [status, setStatus] = useState('ready');
  const [message, setMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [health, setHealth] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [conversionResults, setConversionResults] = useState([]);
  const resultsRef = useRef([]);
  const inputRef = useRef(null);

  const t = dictionaries[language];
  const limits = health?.limits || defaultLimits;
  const selectedBytes = useMemo(
    () => files.reduce((sum, item) => sum + item.file.size, 0),
    [files],
  );
  const convertedResults = useMemo(
    () => conversionResults.filter((result) => result.status === 'converted'),
    [conversionResults],
  );
  const outputType = files.length > 1 ? t.zip : t.vrma;

  useEffect(() => {
    resultsRef.current = conversionResults;
  }, [conversionResults]);

  useEffect(() => {
    let ignore = false;
    fetch(apiUrl('/api/health'))
      .then((response) => response.json())
      .then((data) => {
        if (!ignore) setHealth(data);
      })
      .catch(() => {
        if (!ignore) setHealth({ ok: false });
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      cleanupResultUrls(resultsRef.current);
    };
  }, []);

  function cleanupResultUrls(results) {
    results.forEach((result) => {
      if (result.url) {
        URL.revokeObjectURL(result.url);
      }
    });
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []).filter((file) => file.name.toLowerCase().endsWith('.fbx'));
    if (incoming.length === 0) return;

    setFiles((current) => {
      const next = [...current, ...incoming.map(makeFileItem)];
      return next.slice(0, limits.maxFiles);
    });
    setMessage('');
  }

  function onInputChange(event) {
    addFiles(event.target.files);
    event.target.value = '';
  }

  function onDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  }

  function removeFile(id) {
    setFiles((current) => current.filter((item) => item.id !== id));
    setConversionResults((current) => {
      const result = current.find((item) => item.id === id);
      if (result?.url) URL.revokeObjectURL(result.url);
      return current.filter((item) => item.id !== id);
    });
    if (previewBlob?.id === id) {
      setPreviewBlob(null);
    }
  }

  function clearFiles() {
    cleanupResultUrls(resultsRef.current);
    setFiles([]);
    setConversionResults([]);
    setPreviewBlob(null);
    setMessage('');
  }

  function downloadBlob(url, downloadName) {
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function previewResult(result) {
    if (result.status !== 'converted') return;
    setPreviewBlob({ id: result.id, url: result.url, name: result.downloadName });
    setMessage(`${t.previewing}: ${result.downloadName}`);
  }

  async function downloadAllZip() {
    if (convertedResults.length === 0) return;

    setMessage(t.creatingZip);
    const zip = new JSZip();
    convertedResults.forEach((result) => {
      zip.file(result.downloadName, result.blob);
    });

    const failedResults = conversionResults.filter((result) => result.status === 'failed');
    if (failedResults.length > 0) {
      zip.file('conversion-report.json', JSON.stringify({
        converted: convertedResults.map((result) => result.downloadName),
        failed: failedResults.map((result) => ({
          file: result.sourceName,
          error: result.error,
        })),
      }, null, 2));
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(zipBlob);
    downloadBlob(zipUrl, `vrma-batch-${Date.now()}.zip`);
    setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);
    setMessage(t.downloadStarted);
  }

  async function convertFiles() {
    if (files.length === 0) {
      setMessage(t.selectFileFirst);
      return;
    }

    setStatus('converting');
    setMessage('');
    cleanupResultUrls(resultsRef.current);
    setPreviewBlob(null);

    const nextResults = files.map(({ id, file }) => ({
      id,
      sourceName: file.name,
      sourceSize: file.size,
      status: 'queued',
      downloadName: `${file.name.replace(/\.fbx$/i, '')}.vrma`,
      blob: null,
      url: null,
      error: '',
    }));
    setConversionResults(nextResults);

    try {
      const updatedResults = [...nextResults];
      let firstPreview = null;

      for (let index = 0; index < files.length; index += 1) {
        const { id, file } = files[index];
        setMessage(`${t.convertingFile} ${index + 1}/${files.length}: ${file.name}`);
        updatedResults[index] = { ...updatedResults[index], status: 'converting' };
        setConversionResults([...updatedResults]);

        const formData = new FormData();
        formData.append('files', file, file.name);
        formData.append('framerate', framerate);

        try {
          const response = await fetch(apiUrl('/api/convert'), {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            throw new Error(errorPayload.error || t.conversionFailed);
          }

          const blob = await response.blob();
          const fallbackName = `${file.name.replace(/\.fbx$/i, '')}.vrma`;
          const downloadName = parseDownloadName(response.headers, fallbackName);
          const url = URL.createObjectURL(blob);

          updatedResults[index] = {
            ...updatedResults[index],
            status: 'converted',
            downloadName,
            blob,
            url,
          };

          if (!firstPreview) {
            firstPreview = { id, url, name: downloadName };
            setPreviewBlob(firstPreview);
          }
        } catch (error) {
          updatedResults[index] = {
            ...updatedResults[index],
            status: 'failed',
            error: error.message || t.conversionFailed,
          };
        }

        setConversionResults([...updatedResults]);
      }

      const successCount = updatedResults.filter((result) => result.status === 'converted').length;
      const failedCount = updatedResults.filter((result) => result.status === 'failed').length;
      setStatus('ready');
      if (successCount > 0 && failedCount > 0) {
        setMessage(`${successCount}/${files.length} ${t.converted}, ${failedCount} ${t.failed}`);
      } else if (successCount > 0) {
        setMessage(`${successCount}/${files.length} ${t.convertedResults}`);
      } else {
        setMessage(t.conversionFailed);
      }
    } catch (error) {
      setStatus('ready');
      setMessage(error.message || t.conversionFailed);
    }
  }

  const apiState = !health
    ? { label: t.apiOffline, className: 'muted' }
    : health.ok && health.binary?.exists
      ? { label: t.apiReady, className: 'good' }
      : health.ok
        ? { label: t.apiMissing, className: 'warn' }
        : { label: t.apiOffline, className: 'bad' };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="product-kicker">VRM Animation Tool</p>
          <h1>{t.appTitle}</h1>
          <p>{t.appSubtitle}</p>
          <nav className="repo-links" aria-label={t.repositoryLinks}>
            {repositoryLinks.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                <GitHubIcon />
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <button
          className="icon-button text-button language-button"
          type="button"
          onClick={() => setLanguage((current) => (current === 'en' ? 'ja' : 'en'))}
        >
          <Languages size={17} aria-hidden="true" />
          {t.language}
        </button>
      </header>

      <div className="workspace-grid">
        <section className="panel converter-panel" aria-label={t.convert}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                <Files size={15} aria-hidden="true" />
                {t.queue}
              </span>
              <h2>{t.convert}</h2>
            </div>
            <span className={`api-pill ${apiState.className}`}>
              <Activity size={14} aria-hidden="true" />
              {apiState.label}
            </span>
          </div>

          <button
            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              accept=".fbx"
              multiple
              onChange={onInputChange}
            />
            <span className="drop-icon">
              <Upload size={24} aria-hidden="true" />
            </span>
            <strong>{t.dropTitle}</strong>
            <span>{t.dropCopy}</span>
          </button>

          <div className="toolbar-row">
            <button className="icon-button text-button primary-button" type="button" onClick={() => inputRef.current?.click()}>
              <Upload size={16} aria-hidden="true" />
              {t.addFbx}
            </button>
            <button className="icon-button text-button" type="button" onClick={clearFiles} disabled={files.length === 0}>
              <Trash2 size={16} aria-hidden="true" />
              {t.clear}
            </button>
          </div>

          <div className="settings-row">
            <label className="setting-field">
              <span>
                <Settings2 size={15} aria-hidden="true" />
                {t.framerate}
              </span>
              <input
                type="number"
                min="1"
                max="240"
                value={framerate}
                onChange={(event) => setFramerate(event.target.value)}
              />
            </label>
            <div className="output-chip">
              <FileArchive size={15} aria-hidden="true" />
              {t.output}: {outputType}
            </div>
          </div>

          <div className="file-summary">
            <span>{files.length === 1 ? t.oneFile : `${files.length} ${t.files}`}</span>
            <span>{formatBytes(selectedBytes)}</span>
            <span>{t.fileLimit} {limits.maxFiles}, {limits.maxFileSizeMb} MB {t.perFile}</span>
          </div>

          <div className="file-list" aria-label={t.selectedFiles}>
            {files.length === 0 ? (
              <div className="empty-state">{t.noFiles}</div>
            ) : (
              files.map(({ id, file }) => (
                <div className="file-item" key={id}>
                  <div>
                    <strong>{file.name}</strong>
                    <span>{formatBytes(file.size)}</span>
                  </div>
                  <button className="icon-button" type="button" onClick={() => removeFile(id)} title={t.remove}>
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>

          {conversionResults.length > 0 && (
            <section className="result-panel" aria-label={t.results}>
              <div className="result-heading">
                <span className="eyebrow">
                  <Archive size={15} aria-hidden="true" />
                  {t.results}
                </span>
                <button
                  className="icon-button text-button"
                  type="button"
                  onClick={downloadAllZip}
                  disabled={convertedResults.length === 0 || status === 'converting'}
                >
                  <Download size={16} aria-hidden="true" />
                  {t.downloadAll}
                </button>
              </div>
              <div className="result-list">
                {conversionResults.map((result) => (
                  <div className={`result-item ${result.status}`} key={result.id}>
                    <div className="result-meta">
                      {result.status === 'converted' && <CheckCircle2 size={16} aria-hidden="true" />}
                      {result.status === 'failed' && <AlertCircle size={16} aria-hidden="true" />}
                      {result.status === 'converting' && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
                      {result.status === 'queued' && <Files size={16} aria-hidden="true" />}
                      <div>
                        <strong>{result.sourceName}</strong>
                        <span>
                          {result.status === 'converted' && `${t.converted} · ${formatBytes(result.blob.size)}`}
                          {result.status === 'failed' && `${t.failed} · ${result.error}`}
                          {result.status === 'converting' && t.converting}
                          {result.status === 'queued' && t.ready}
                        </span>
                      </div>
                    </div>
                    <div className="result-actions">
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => previewResult(result)}
                        disabled={result.status !== 'converted'}
                        title={t.previewAction}
                      >
                        <Eye size={16} aria-hidden="true" />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => downloadBlob(result.url, result.downloadName)}
                        disabled={result.status !== 'converted'}
                        title={t.downloadVrma}
                      >
                        <Download size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="convert-footer">
            <div className="message-line">
              <span className={`status-dot ${message ? 'active' : ''}`} />
              <span>{message || t.ready}</span>
            </div>
            <button
              className="icon-button text-button convert-button"
              type="button"
              disabled={status === 'converting' || files.length === 0}
              onClick={convertFiles}
            >
              {status === 'converting' ? (
                <LoaderCircle className="spin" size={18} aria-hidden="true" />
              ) : (
                <Download size={18} aria-hidden="true" />
              )}
              {status === 'converting' ? t.converting : t.convert}
            </button>
          </div>
        </section>

        <PreviewPanel t={t} vrmaPreview={previewBlob} />
      </div>
    </main>
  );
}
