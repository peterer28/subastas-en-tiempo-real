import { Component, HostListener, computed, input, signal } from '@angular/core';

@Component({
  selector: 'app-image-carousel',
  standalone: true,
  template: `
    <div class="carousel" (touchstart)="touchStart($event)" (touchend)="touchEnd($event)">
      <div class="main">
        <img [src]="images()[index()]" [alt]="alt() + ', foto ' + (index() + 1)" (click)="viewer.set(true)">
        @if (images().length > 1) {
          <button class="nav prev" (click)="prev()" aria-label="Foto anterior">‹</button>
          <button class="nav next" (click)="next()" aria-label="Foto siguiente">›</button>
        }
        <span class="counter num">{{ index() + 1 }} / {{ images().length }}</span>
      </div>

      <div class="side">
        @for (src of sideThumbs(); track src.i; let last = $last) {
          <button class="thumb" [class.on]="src.i === index()" (click)="last && remaining() > 0 ? viewer.set(true) : go(src.i)"
                  [attr.aria-label]="'Ver foto ' + (src.i + 1)">
            <img [src]="src.url" alt="" loading="lazy">
            @if (last && remaining() > 0) {
              <span class="more">
                <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><rect x="2" y="4" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="9" r="1.6" fill="currentColor"/><path d="m4 15 4-4 3 3 2-2 3 3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
                {{ images().length }} fotos
              </span>
            }
          </button>
        }
      </div>
    </div>

    <div class="strip" role="list">
      @for (url of images(); track $index) {
        <button role="listitem" class="mini" [class.on]="$index === index()" (click)="go($index)" [attr.aria-label]="'Foto ' + ($index + 1)">
          <img [src]="url" alt="" loading="lazy">
        </button>
      }
    </div>

    @if (viewer()) {
      <div class="viewer" role="dialog" aria-modal="true" aria-label="Galería de fotos" (click)="viewer.set(false)">
        <button class="v-close" aria-label="Cerrar galería">×</button>
        <img [src]="images()[index()]" [alt]="alt()" (click)="$event.stopPropagation()">
        <button class="nav prev" (click)="prev(); $event.stopPropagation()" aria-label="Foto anterior">‹</button>
        <button class="nav next" (click)="next(); $event.stopPropagation()" aria-label="Foto siguiente">›</button>
        <span class="v-counter num">{{ index() + 1 }} / {{ images().length }}</span>
      </div>
    }
  `,
  styles: [`
    .carousel { display: grid; grid-template-columns: 3fr 1fr; gap: 4px; border-radius: var(--radius-card); overflow: hidden; }
    .main { position: relative; aspect-ratio: 4 / 3; background: #eceeef; }
    .main img { width: 100%; height: 100%; object-fit: cover; cursor: zoom-in; }
    .nav { position: absolute; top: 50%; transform: translateY(-50%); width: 42px; height: 42px; border-radius: 50%;
           border: 0; background: rgba(255,255,255,.92); font-size: 1.8rem; line-height: 1; cursor: pointer; color: var(--ink);
           box-shadow: 0 2px 8px rgba(47,54,61,.18); display: grid; place-items: center; padding-bottom: 4px; }
    .nav:hover { background: #fff; color: var(--signal); }
    .prev { left: 12px; } .next { right: 12px; }
    .counter { position: absolute; bottom: 12px; left: 12px; background: rgba(255,255,255,.92); padding: 2px 10px; border-radius: var(--radius-pill); font-weight: 600; }
    .side { display: grid; grid-template-rows: repeat(3, 1fr); gap: 4px; }
    .thumb { position: relative; border: 0; padding: 0; cursor: pointer; background: #eceeef; overflow: hidden; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; }
    .thumb.on { outline: 3px solid var(--signal); outline-offset: -3px; }
    .more { position: absolute; right: 8px; bottom: 8px; background: #fff; border-radius: 6px; padding: 5px 10px; font-size: .82rem;
            font-weight: 600; display: flex; gap: 6px; align-items: center; box-shadow: 0 1px 4px rgba(47,54,61,.2); }
    .strip { display: flex; gap: 6px; overflow-x: auto; padding: 8px 0 2px; scrollbar-width: thin; }
    .mini { flex: 0 0 76px; height: 56px; border: 2px solid transparent; border-radius: 6px; padding: 0; overflow: hidden; cursor: pointer; background: #eceeef; }
    .mini img { width: 100%; height: 100%; object-fit: cover; opacity: .75; }
    .mini.on { border-color: var(--signal); }
    .mini.on img, .mini:hover img { opacity: 1; }
    .viewer { position: fixed; inset: 0; background: rgba(245,246,244,.97); z-index: 200; display: grid; place-items: center; padding: 48px 72px; }
    .viewer img { max-width: 100%; max-height: calc(100vh - 96px); object-fit: contain; border-radius: 6px; box-shadow: var(--shadow-panel); }
    .v-close { position: absolute; top: 12px; right: 18px; border: 0; background: none; font-size: 2.4rem; cursor: pointer; color: var(--ink-soft); }
    .v-counter { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); font-weight: 600; color: var(--ink-soft); }
    @media (max-width: 720px) {
      .carousel { grid-template-columns: 1fr; }
      .side { display: none; }
      .viewer { padding: 48px 8px; }
    }
  `],
})
export class ImageCarouselComponent {
  images = input.required<string[]>();
  alt = input('Vehículo');

  index = signal(0);
  viewer = signal(false);
  private touchX = 0;

  /** Las 3 fotos siguientes a la principal, en el lateral. */
  sideThumbs = computed(() => {
    const n = this.images().length;
    const out: { i: number; url: string }[] = [];
    for (let k = 1; k <= Math.min(3, n - 1); k++) {
      const i = (this.index() + k) % n;
      out.push({ i, url: this.images()[i] });
    }
    return out;
  });
  remaining = computed(() => Math.max(0, this.images().length - 4));

  go(i: number): void { this.index.set(i); }
  next(): void { this.index.update((i) => (i + 1) % this.images().length); }
  prev(): void { this.index.update((i) => (i - 1 + this.images().length) % this.images().length); }

  touchStart(e: TouchEvent): void { this.touchX = e.changedTouches[0].clientX; }
  touchEnd(e: TouchEvent): void {
    const dx = e.changedTouches[0].clientX - this.touchX;
    if (Math.abs(dx) > 40) (dx < 0 ? this.next() : this.prev());
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if (e.key === 'ArrowRight') this.next();
    else if (e.key === 'ArrowLeft') this.prev();
    else if (e.key === 'Escape') this.viewer.set(false);
  }
}
