import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-camera-capture',
  imports: [],
  templateUrl: './camera-capture.html',
  styleUrl: './camera-capture.css',
})
export class CameraCapture {
  readonly captured = output<File>();
  readonly closed = output<void>();

  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');
  protected readonly error = signal<string | null>(null);
  protected readonly ready = signal(false);
  private stream: MediaStream | null = null;

  constructor() {
    afterNextRender(() => void this.start());
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected capture(): void {
    const video = this.videoRef()?.nativeElement;
    if (!video) {
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          return;
        }
        this.stop();
        this.captured.emit(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9,
    );
  }

  protected close(): void {
    this.stop();
    this.closed.emit();
  }

  private async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set('Camera is not available on this device.');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      const video = this.videoRef()?.nativeElement;
      if (video) {
        video.srcObject = this.stream;
        await video.play();
        this.ready.set(true);
      }
    } catch {
      this.error.set('Could not access the camera. Please allow camera permission and try again.');
    }
  }

  private stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
