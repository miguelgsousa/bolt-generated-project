export class CircleSimulation {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private animationId: number = 0;
  private running: boolean = false;
  private startTime: number = 0;
  private elapsedTime: number = 0;
  private simulationColor: string;
  private onRecordingComplete?: (blob: Blob) => void;
  private textElements: any[] = [];
  private onCollision?: () => void;
  private isDragging: boolean = false;

  // Constants
  private readonly WIDTH: number;
  private readonly HEIGHT: number;
  private readonly INITIAL_BALL_RADIUS = 5;
  private readonly CIRCLE_RADIUS: number;
  private GRAVITY = 0.4;
  private VELOCITY_INCREASE_FACTOR = 1.02;
  private VELOCITY_DECAY = 0.998;
  private BALL_GROWTH_RATE = 1.015;
  private readonly MAX_BALL_RADIUS: number;
  private readonly MOTION_BLUR_STEPS = 5;
  private previousPositions: Array<[number, number]> = [];

  // Ball properties
  private ballRadius: number;
  private ballCenter: [number, number];
  private ballVelocity: [number, number];
  private collisionPoints: Array<[number, number]> = [];

  constructor(canvas: HTMLCanvasElement, textElements: any[], onCollision?: () => void) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    this.ctx = ctx;

    this.WIDTH = canvas.width;
    this.HEIGHT = canvas.height;
    this.CIRCLE_RADIUS = Math.min(this.WIDTH, this.HEIGHT) / 2 - 125;
    this.MAX_BALL_RADIUS = this.CIRCLE_RADIUS - 10;
    this.simulationColor = this.generateRandomColor();
    this.textElements = textElements;
    this.onCollision = onCollision;
    this.isDragging = false;

    this.reset();
    this.setupRecording();
  }

  public updateTextElements(textElements: any[]) {
    this.textElements = textElements;
  }

  private generateRandomColor(): string {
    const hue = Math.random() * 360;
    return `hsl(${hue}, 100%, 50%)`;
  }

  private setupRecording(stream?: MediaStream) {
    const recordingStream = stream || this.canvas.captureStream(60);
    this.mediaRecorder = new MediaRecorder(recordingStream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 5000000
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: 'video/webm' });
      if (this.onRecordingComplete) {
        this.onRecordingComplete(blob);
      }
      this.chunks = [];
    };
  }

  public startRecording(onComplete?: (blob: Blob) => void, stream?: MediaStream) {
    this.setupRecording(stream);
    if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
      this.chunks = [];
      this.onRecordingComplete = onComplete;
      this.mediaRecorder.start();
    }
  }

  public stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }

  public reset() {
    this.ballRadius = this.INITIAL_BALL_RADIUS;
    this.ballCenter = [this.WIDTH / 2, this.HEIGHT / 2.7];
    this.ballVelocity = [0.8, 0.8];
    this.collisionPoints = [];
    this.previousPositions = [];
    this.startTime = performance.now();
    this.elapsedTime = 0;
    this.simulationColor = this.generateRandomColor();
  }

  public setGravity(value: number) {
    this.GRAVITY = value;
  }

  public setVelocityIncrease(value: number) {
    this.VELOCITY_INCREASE_FACTOR = 1 + value;
  }

  public setVelocityDecay(value: number) {
    this.VELOCITY_DECAY = value;
  }

  public setBallGrowthRate(value: number) {
    this.BALL_GROWTH_RATE = 1 + value;
  }

  private update() {
    this.elapsedTime = (performance.now() - this.startTime) / 1000;

    this.previousPositions.push([...this.ballCenter]);
    if (this.previousPositions.length > this.MOTION_BLUR_STEPS) {
      this.previousPositions.shift();
    }

    // Apply gravity
    this.ballVelocity[1] += this.GRAVITY;

    // Apply velocity decay
    this.ballVelocity[0] *= this.VELOCITY_DECAY;
    this.ballVelocity[1] *= this.VELOCITY_DECAY;

    // Update ball position
    this.ballCenter[0] += this.ballVelocity[0];
    this.ballCenter[1] += this.ballVelocity[1];

    // Check for collision with circle
    const circleCenter: [number, number] = [this.WIDTH / 2, this.HEIGHT / 2];
    const dx = this.ballCenter[0] - circleCenter[0];
    const dy = this.ballCenter[1] - circleCenter[1];
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance >= this.CIRCLE_RADIUS - this.ballRadius) {
      // Calculate normal vector
      const nx = dx / distance;
      const ny = dy / distance;

      // Calculate reflection
      const dot = this.ballVelocity[0] * nx + this.ballVelocity[1] * ny;
      const restitution = 0.9;
      
      this.ballVelocity[0] = (this.ballVelocity[0] - 2 * dot * nx) * restitution;
      this.ballVelocity[1] = (this.ballVelocity[1] - 2 * dot * ny) * restitution;

      // Increase ball size with limit
      if (this.ballRadius < this.MAX_BALL_RADIUS) {
        this.ballRadius = Math.min(
          this.ballRadius * this.BALL_GROWTH_RATE,
          this.MAX_BALL_RADIUS
        );
      }

      // Velocity increase
      this.ballVelocity[0] *= this.VELOCITY_INCREASE_FACTOR;
      this.ballVelocity[1] *= this.VELOCITY_INCREASE_FACTOR;

      // Add minimum velocity to prevent stopping
      const minVelocity = 1.0;
      const currentVelocity = Math.sqrt(this.ballVelocity[0]**2 + this.ballVelocity[1]**2);
      if (currentVelocity < minVelocity) {
        const scale = minVelocity / currentVelocity;
        this.ballVelocity[0] *= scale;
        this.ballVelocity[1] *= scale;
      }

      // Calculate collision point
      const angle = Math.atan2(dy, dx);
      const collisionX = circleCenter[0] + this.CIRCLE_RADIUS * Math.cos(angle);
      const collisionY = circleCenter[1] + this.CIRCLE_RADIUS * Math.sin(angle);
      this.collisionPoints.push([collisionX, collisionY]);

      // Adjust ball position to prevent sticking
      this.ballCenter[0] = circleCenter[0] + (this.CIRCLE_RADIUS - this.ballRadius) * Math.cos(angle);
      this.ballCenter[1] = circleCenter[1] + (this.CIRCLE_RADIUS - this.ballRadius) * Math.sin(angle);

      // Trigger collision callback
      if (this.onCollision) {
        this.onCollision();
      }
    }
  }

  private draw() {
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);

    const circleCenter: [number, number] = [this.WIDTH / 2, this.HEIGHT / 2];

    // Draw main circle
    this.ctx.strokeStyle = this.simulationColor;
    this.ctx.lineWidth = 25;
    this.ctx.beginPath();
    this.ctx.arc(circleCenter[0], circleCenter[1], this.CIRCLE_RADIUS + 12.5, 0, Math.PI * 2);
    this.ctx.stroke();

    // Draw collision lines
    this.ctx.strokeStyle = this.simulationColor;
    this.ctx.lineWidth = 2;
    for (const point of this.collisionPoints) {
      this.ctx.beginPath();
      this.ctx.moveTo(point[0], point[1]);
      this.ctx.lineTo(this.ballCenter[0], this.ballCenter[1]);
      this.ctx.stroke();
    }

    // Draw all text elements
    for (const text of this.textElements) {
      this.ctx.fillStyle = text.color;
      this.ctx.font = `${text.size}px ${text.font}`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(text.text, text.x, text.y);
    }

    // Draw timer below the circle
    this.ctx.fillStyle = 'white';
    this.ctx.font = '24px Arial';
    this.ctx.fillText(
      `Time: ${this.elapsedTime.toFixed(1)}s`,
      circleCenter[0],
      circleCenter[1] + this.CIRCLE_RADIUS + 60
    );

    // Draw motion blur
    this.previousPositions.forEach((pos, index) => {
      const alpha = (index + 1) / this.MOTION_BLUR_STEPS;
      this.ctx.fillStyle = `${this.simulationColor}${Math.floor(alpha * 33).toString(16).padStart(2, '0')}`;
      this.ctx.beginPath();
      this.ctx.arc(pos[0], pos[1], this.ballRadius, 0, Math.PI * 2);
      this.ctx.fill();
    });

    // Draw ball
    this.ctx.fillStyle = this.simulationColor;
    this.ctx.beginPath();
    this.ctx.arc(this.ballCenter[0], this.ballCenter[1], this.ballRadius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private animate = () => {
    if (!this.running) return;
    
    this.update();
    this.draw();
    this.animationId = requestAnimationFrame(this.animate);
  };

  public start() {
    if (!this.running) {
      this.startTime = performance.now() - (this.elapsedTime * 1000);
    }
    this.running = true;
    this.animate();
  }

  public stop() {
    this.running = false;
    cancelAnimationFrame(this.animationId);
  }

  public isRunning() {
    return this.running;
  }

  public handleMouseDown(x: number, y: number) {
    const dx = x - this.ballCenter[0];
    const dy = y - this.ballCenter[1];
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= this.ballRadius) {
      this.isDragging = true;
      this.stop(); // Pause animation while dragging
    }
  }

  public handleMouseMove(x: number, y: number) {
    if (this.isDragging) {
      this.ballCenter[0] = x;
      this.ballCenter[1] = y;
      this.ballVelocity = [0, 0]; // Reset velocity while dragging
      this.draw(); // Update the canvas
    }
  }

  public handleMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.start(); // Resume animation
    }
  }
}
