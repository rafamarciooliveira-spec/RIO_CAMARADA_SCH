import React, { useState, useRef, useEffect } from 'react';
import { uploadImageWithFallback } from '../utils/imageStorage.ts';
import {
  Camera,
  Upload,
  Trash2,
  RefreshCw,
  Crop,
  Check,
  X,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Video,
  VideoOff,
  Cloud,
} from 'lucide-react';

interface PhotoUploaderProps {
  currentPhotoUrl?: string;
  onPhotoSelected: (url: string) => void;
  aspectRatio?: '3:4' | '1:1' | '16:9' | 'free';
  storageFolder?: string;
  label?: string;
  helperText?: string;
  enableCamera?: boolean;
}

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  currentPhotoUrl = '',
  onPhotoSelected,
  aspectRatio = 'free',
  storageFolder = 'photos',
  label = 'Carregar Foto',
  helperText = 'Arraste uma foto ou selecione do seu aparelho.',
  enableCamera = true,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [warningNotice, setWarningNotice] = useState<string | null>(null);

  // Camera modal state
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop camera when modal closes
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const handleStartCamera = async () => {
    setCameraError(null);
    setShowCameraModal(true);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Acesso à câmera não suportado neste navegador.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.warn('Erro ao acessar câmera:', err);
      setCameraError(err.message || 'Não foi possível acessar a câmera do dispositivo. Verifique as permissões.');
    }
  };

  const handleFlipCamera = async () => {
    stopCamera();
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextMode },
        audio: false,
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (e) {}
  };

  const handleCaptureFromCamera = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // If front camera, flip horizontally for natural mirror feel
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedDataUrl = canvas.toDataURL('image/jpeg', 0.9);

    stopCamera();
    setShowCameraModal(false);
    processAndUpload(capturedDataUrl);
  };

  const processAndUpload = async (fileOrDataUrl: File | string) => {
    setProcessing(true);
    setUploadProgress(10);
    setWarningNotice(null);

    try {
      const fileName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;
      const storagePath = `${storageFolder}/${fileName}`;

      const res = await uploadImageWithFallback(fileOrDataUrl, storagePath, {
        aspectRatio,
        onProgress: pct => setUploadProgress(pct),
      });

      onPhotoSelected(res.url);

      if (res.warningNotice) {
        setWarningNotice(res.warningNotice);
        setTimeout(() => setWarningNotice(null), 6000);
      }
    } catch (err: any) {
      console.error('Erro ao processar imagem:', err);
      setWarningNotice('Erro ao processar imagem: ' + (err.message || 'Falha de leitura.'));
    } finally {
      setProcessing(false);
      setUploadProgress(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processAndUpload(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processAndUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleRemove = () => {
    onPhotoSelected('');
  };

  const frameClass =
    aspectRatio === '3:4'
      ? 'w-32 h-44'
      : aspectRatio === '1:1'
      ? 'w-36 h-36'
      : 'w-48 h-32';

  return (
    <div className="space-y-3">
      {label && (
        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300">
          {label}
        </label>
      )}

      {/* Main Preview & Action Container */}
      <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800 shadow-inner">
        {/* Photo Box */}
        <div className="relative group shrink-0">
          <div
            className={`${frameClass} rounded-2xl overflow-hidden border-2 ${
              currentPhotoUrl ? 'border-emerald-500 shadow-lg' : 'border-dashed border-zinc-700 bg-zinc-900/60'
            } flex items-center justify-center relative transition-all`}
          >
            {currentPhotoUrl ? (
              <img
                src={currentPhotoUrl}
                alt="Foto"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-zinc-500 p-2 text-center text-xs space-y-1">
                <Camera className="w-8 h-8 opacity-40" />
                <span className="text-[11px] font-medium">{aspectRatio === '3:4' ? '3x4 Oficial' : 'Sem foto'}</span>
              </div>
            )}

            {/* Processing spinner overlay */}
            {processing && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center text-emerald-400 gap-2 p-2">
                <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] font-bold text-white text-center">Processando...</span>
              </div>
            )}
          </div>

          {aspectRatio === '3:4' && (
            <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-extrabold text-[9px] uppercase tracking-wider shadow-sm">
              Formato 3x4
            </span>
          )}
        </div>

        {/* Drop Zone & Controls */}
        <div className="flex-1 space-y-3 w-full">
          {/* Drag & Drop Box */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-xl p-3.5 text-center transition-all ${
              isDragging
                ? 'border-emerald-400 bg-emerald-950/30 scale-101'
                : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
            }`}
          >
            <p className="text-xs text-zinc-300 font-medium">
              {helperText}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Redução e otimização automática de tamanho em alta qualidade.
            </p>

            {/* Buttons Row */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={processing}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{currentPhotoUrl ? 'Trocar Foto' : 'Escolher Arquivo'}</span>
              </button>

              {enableCamera && (
                <button
                  type="button"
                  onClick={handleStartCamera}
                  disabled={processing}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-all border border-zinc-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Abrir câmera do celular ou computador"
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Tirar com a Câmera</span>
                </button>
              )}

              {currentPhotoUrl && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={processing}
                  className="px-3 py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-500/40 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Remover foto atual"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remover</span>
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          {uploadProgress !== null && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                <span>Otimizando e enviando...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Warning or Storage Fallback Notice */}
          {warningNotice && (
            <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-[11px] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{warningNotice}</span>
            </div>
          )}
        </div>
      </div>

      {/* Camera Capture Modal */}
      {showCameraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-lg w-full p-6 shadow-2xl text-zinc-100 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-emerald-400" />
                <h4 className="font-bold text-base text-white">Capturar Foto com a Câmera</h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setShowCameraModal(false);
                }}
                className="text-zinc-400 hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {cameraError ? (
              <div className="p-4 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 text-xs space-y-2">
                <div className="font-bold">Acesso não permitido à câmera</div>
                <div>{cameraError}</div>
                <div className="text-zinc-400">Você também pode enviar um arquivo diretamente da sua galeria.</div>
              </div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-4/3 flex items-center justify-center border border-zinc-800">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                />

                {/* 3x4 Guideline Overlay */}
                {aspectRatio === '3:4' && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-44 h-60 border-2 border-emerald-400/80 rounded-2xl shadow-2xl bg-emerald-500/5 relative">
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-zinc-950 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Posicione o Rosto Aqui
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Camera Action Buttons */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleFlipCamera}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold flex items-center gap-1.5 border border-zinc-700 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Alternar Câmera</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setShowCameraModal(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCaptureFromCamera}
                  disabled={!!cameraError}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>Fotografar Agora</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
