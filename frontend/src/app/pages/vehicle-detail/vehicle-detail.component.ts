import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LiveAuction, LiveBid, VehicleDetail } from '../../core/models/models';
import { VehicleService } from '../../core/services/vehicle.service';
import { LiveAuctionService } from '../../core/services/live-auction.service';
import { ClockService } from '../../core/services/clock.service';
import { AuthService } from '../../core/services/auth.service';
import { ImageCarouselComponent } from '../../shared/image-carousel.component';
import { RemainingPipe, WhenPipe } from '../../shared/format';
import { BidPanelComponent } from './bid-panel.component';

@Component({
  selector: 'app-vehicle-detail',
  standalone: true,
  imports: [RouterLink, ImageCarouselComponent, BidPanelComponent, RemainingPipe, WhenPipe],
  template: `
    @if (error()) {
      <section class="wrap state">
        <h1>{{ error() }}</h1>
        <a class="btn btn-outline" routerLink="/">Volver al inventario</a>
      </section>
    } @else {
      @if (vehicle(); as v) {
      <section class="wrap page">
        <nav class="crumbs" aria-label="Ruta">
          <a routerLink="/">Inventario</a><span>›</span>
          <span>{{ v.itemType }}</span><span>›</span>
          <span>{{ v.make }}</span><span>›</span>
          <b>{{ title() }}</b>
        </nav>

        <div class="layout">
          <div class="left">
            <app-image-carousel [images]="photos()" [alt]="title()" />

            <div class="damage-callout dmg-box-{{ v.damage.code }}">
              <span class="dmg dmg-{{ v.damage.code }}">{{ v.damage.name }}</span>
              <span>{{ v.damage.description }}</span>
            </div>

            <h2 class="sec-title">Ficha técnica</h2>
            <dl class="specs">
              <div><dt>Número de lote</dt><dd>{{ v.lotNumber }}</dd></div>
              <div><dt>Año</dt><dd>{{ v.year }}</dd></div>
              <div><dt>Tipo de artículo</dt><dd>{{ v.itemType }}</dd></div>
              <div><dt>Marca</dt><dd>{{ v.make }}</dd></div>
              <div><dt>Modelo</dt><dd>{{ v.model }}</dd></div>
              <div><dt>Motor</dt><dd>{{ v.engine }}</dd></div>
              <div><dt>Transmisión</dt><dd>{{ v.transmission }}</dd></div>
              <div><dt>Combustible</dt><dd>{{ v.fuelType }}</dd></div>
              <div><dt>Tren de manejo</dt><dd>{{ v.drivetrain }}</dd></div>
              <div><dt>Cilindros</dt><dd>{{ v.cylinders === 0 ? 'Eléctrico (0)' : v.cylinders }}</dd></div>
              @if (v.mileage !== null) { <div><dt>Kilometraje</dt><dd>{{ v.mileage.toLocaleString('es-GT') }} km</dd></div> }
              <div><dt>Ubicación</dt><dd>{{ v.location }}</dd></div>
            </dl>

            @if (v.description) {
              <h2 class="sec-title">Descripción del vendedor</h2>
              <p class="description">{{ v.description }}</p>
            }
          </div>

          <aside class="right">
            <span class="lot num">Lote {{ v.lotNumber }}</span>
            <h1>{{ title() }}</h1>
            <p class="loc">{{ v.location }}</p>
            <p class="summary">
              {{ live()?.bidCount ?? v.auction.totalBids }} ofertas,
              @if (closed()) { cerró {{ (live()?.endsAt ?? v.auction.endsAt) | when }} }
              @else { cierra {{ (live()?.endsAt ?? v.auction.endsAt) | when }} }
            </p>

            @if (live() !== undefined) {
              <app-bid-panel
                [auctionId]="v.auction.id"
                [auction]="live() ?? null"
                [bids]="bids()"
                [now]="clock.now()"
                [myToken]="myToken()"
                [loggedIn]="auth.isLoggedIn()"
                [isOwner]="v.isOwner" />
            } @else {
              <div class="panel-loading">Conectando con la subasta en vivo…</div>
            }

            @if (v.isOwner) {
              <a class="btn btn-quiet btn-block edit" [routerLink]="['/publicar', v.id]">Editar publicación</a>
            }
          </aside>
        </div>
            </section>
      } @else {
        <section class="wrap state"><p>Cargando vehículo…</p></section>
      }
    }
    @if (toast()) { <div class="toast" role="status">{{ toast() }}</div> }
  `,
  styles: [`
    .page { padding-top: 18px; padding-bottom: 64px; }
    .state { padding: 80px 24px; text-align: center; display: flex; flex-direction: column; gap: 18px; align-items: center; }
    .crumbs { display: flex; flex-wrap: wrap; gap: 8px; font-size: .85rem; color: var(--ink-soft); margin-bottom: 18px; }
    .crumbs a { color: var(--ink); }
    .crumbs b { color: var(--ink); font-weight: 600; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 32px; align-items: start; }
    .right { position: sticky; top: 126px; display: flex; flex-direction: column; gap: 6px; }
    .lot { align-self: flex-start; background: var(--signal-soft); color: var(--signal-hover); border-radius: var(--radius-pill); padding: 1px 10px; font-size: .82rem; font-weight: 600; }
    .right h1 { font-size: 1.85rem; font-weight: 500; line-height: 1.2; margin-top: 4px; }
    .loc { margin: 0; color: var(--ink-soft); }
    .summary { margin: 0 0 10px; font-size: .88rem; color: var(--ink-soft); }
    .panel-loading { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 40px 20px; text-align: center; color: var(--ink-soft); }
    .edit { margin-top: 10px; }

    .damage-callout { margin-top: 18px; display: flex; gap: 12px; align-items: center; padding: 12px 16px; border-radius: var(--radius-card); background: var(--paper); border: 1px solid var(--line); }
    .dmg-box-VERDE { border-left: 5px solid var(--dmg-green); }
    .dmg-box-AMARILLO { border-left: 5px solid var(--dmg-amber); }
    .dmg-box-ROJO { border-left: 5px solid var(--dmg-red); }
    .sec-title { margin: 32px 0 12px; }
    .specs { margin: 0; background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius-card); }
    .specs div { display: grid; grid-template-columns: 200px 1fr; padding: 12px 18px; border-bottom: 1px solid var(--line); }
    .specs div:last-child { border-bottom: 0; }
    .specs dt { color: var(--ink-soft); }
    .specs dd { margin: 0; font-weight: 500; }
    .description { max-width: 70ch; color: var(--ink); white-space: pre-line; margin: 0; }
    @media (max-width: 1000px) {
      .layout { display: flex; flex-direction: column; }
      .left { width: 100%; }
      .right { position: static; width: 100%; }
    }
    @media (max-width: 560px) { .specs div { grid-template-columns: 1fr; gap: 2px; } }
  `],
})
export class VehicleDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private vehicles = inject(VehicleService);
  private liveSvc = inject(LiveAuctionService);
  private destroyRef = inject(DestroyRef);
  auth = inject(AuthService);
  clock = inject(ClockService);

  vehicle = signal<VehicleDetail | null>(null);
  /** undefined = aún no responde Firebase; null = sin nodo en vivo */
  live = signal<LiveAuction | null | undefined>(undefined);
  bids = signal<LiveBid[]>([]);
  myToken = signal<string | null>(null);
  error = signal('');
  toast = signal<string>(history.state?.toast ?? '');

  title = computed(() => {
    const v = this.vehicle();
    return v ? `${v.year} ${v.make} ${v.model}` : '';
  });
  photos = computed(() => (this.vehicle()?.photoIds ?? []).map((id) => this.vehicles.photoUrl(id)));
  closed = computed(() => {
    const a = this.live();
    return !!a && (a.status === 'sold' || a.status === 'deserted' || a.endsAt <= this.clock.now());
  });

  ngOnInit(): void {
    if (this.toast()) setTimeout(() => this.toast.set(''), 3500);
    const id = this.route.snapshot.paramMap.get('id')!;
    this.vehicles.detail(id).subscribe({
      next: (v) => {
        this.vehicle.set(v);
        const auctionId = v.auction.id;

        this.liveSvc.auction(auctionId).pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((a) => this.live.set(a));
        this.liveSvc.bids(auctionId).pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((list) => this.bids.set(list));

        if (this.auth.isLoggedIn()) {
          this.vehicles.myBidderIdentity(auctionId).subscribe({
            next: (me) => this.myToken.set(me.bidderToken),
            error: () => this.myToken.set(null),
          });
        }
      },
      error: (err) => this.error.set(err.status === 404 ? 'Este vehículo no existe o fue retirado.' : 'No se pudo cargar el vehículo.'),
    });
  }
}
