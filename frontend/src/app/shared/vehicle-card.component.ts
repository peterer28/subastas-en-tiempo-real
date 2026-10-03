import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LiveAuction, VehicleCard } from '../core/models/models';
import { VehicleService } from '../core/services/vehicle.service';
import { QuetzalPipe, RemainingPipe, WhenPipe } from './format';

@Component({
  selector: 'app-vehicle-card',
  standalone: true,
  imports: [RouterLink, QuetzalPipe, RemainingPipe, WhenPipe],
  template: `
    @let v = vehicle();
    <article class="card" [class.row]="layout() === 'list'">
      <a class="photo" [routerLink]="['/vehiculo', v.id]" [attr.aria-label]="'Ver ' + title()">
        <img [src]="photo()" [alt]="title()" loading="lazy">
        <span class="lot num">Lote {{ v.lotNumber }}</span>
        <span class="dmg dmg-{{ v.damage.code }}">{{ v.damage.name }}</span>
        @if (state() === 'final') { <span class="hot">Último minuto</span> }
      </a>

      <div class="body">
        <a class="title" [routerLink]="['/vehiculo', v.id]">{{ title() }}</a>
        <p class="specs">{{ v.itemType }}, {{ v.fuelType }}, {{ v.drivetrain }}, {{ v.transmission }}</p>
        <p class="where">{{ v.location }}</p>

        <div class="price">
          <span class="amount num">{{ price() | q }}</span>
          <span class="label">{{ priceLabel() }}</span>
        </div>

        <dl class="meta">
          <div><dt>Ofertas</dt><dd>{{ bids() }}</dd></div>
          <div>
            @switch (state()) {
              @case ('scheduled') { <dt>Inicia</dt><dd>{{ startsAt() | when }}</dd> }
              @case ('closed') { <dt>Cerró</dt><dd>{{ endsAt() | when }}</dd> }
              @default {
                <dt>Cierra en</dt>
                <dd class="num" [class.urgent]="remaining() < 3600000">{{ remaining() | remaining }}</dd>
              }
            }
          </div>
        </dl>

        <a class="btn btn-block" [class.btn-primary]="state() !== 'closed'" [class.btn-quiet]="state() === 'closed'"
           [routerLink]="['/vehiculo', v.id]">
          {{ state() === 'closed' ? 'Ver resultado' : state() === 'scheduled' ? 'Ver detalles' : 'Ofertar' }}
        </a>
      </div>
    </article>
  `,
  styles: [`
    .card { background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius-card); overflow: hidden;
            display: flex; flex-direction: column; height: 100%; }
    .card:hover { border-color: var(--line-strong); }
    .photo { position: relative; display: block; aspect-ratio: 4 / 3; background: var(--canvas); }
    .photo img { width: 100%; height: 100%; object-fit: cover; }
    .lot { position: absolute; left: 0; bottom: 0; background: rgba(255,255,255,.94); padding: 3px 10px;
           font-size: .85rem; font-weight: 600; border-top-right-radius: 6px; }
    .photo .dmg { position: absolute; top: 10px; left: 10px; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .hot { position: absolute; top: 10px; right: 10px; background: var(--signal); color: #fff; font-size: .75rem;
           font-weight: 700; padding: 3px 10px; border-radius: var(--radius-pill); animation: blink 1.2s infinite; }
    @keyframes blink { 50% { opacity: .55; } }
    .body { padding: 12px 14px 14px; display: flex; flex-direction: column; flex: 1; }
    .title { font-weight: 600; font-size: 1.02rem; text-decoration: none; line-height: 1.3; }
    .title:hover { color: var(--signal); }
    .specs { margin: 4px 0 0; color: var(--ink-soft); font-size: .85rem; }
    .where { margin: 2px 0 0; color: var(--ink-faint); font-size: .82rem; }
    .price { margin-top: 10px; display: flex; align-items: baseline; gap: 8px; }
    .amount { font-size: 1.6rem; font-weight: 700; }
    .label { font-size: .8rem; color: var(--ink-soft); }
    .meta { display: flex; gap: 22px; margin: 6px 0 12px; font-size: .82rem; }
    .meta div { display: flex; gap: 5px; }
    .meta dt { color: var(--ink-soft); }
    .meta dd { margin: 0; font-weight: 600; }
    .meta dd.num { font-size: .95rem; }
    .urgent { color: var(--signal); }
    .body .btn { margin-top: auto; }

    .card.row { flex-direction: row; }
    .card.row .photo { width: 300px; flex-shrink: 0; aspect-ratio: auto; }
    .card.row .body { padding: 16px 20px; }
    .card.row .btn-block { width: auto; align-self: flex-start; }
    @media (max-width: 640px) { .card.row { flex-direction: column; } .card.row .photo { width: 100%; aspect-ratio: 4/3; } }
  `],
})
export class VehicleCardComponent {
  private vehicles = inject(VehicleService);

  vehicle = input.required<VehicleCard>();
  live = input<LiveAuction | undefined>(undefined);
  now = input.required<number>();
  layout = input<'grid' | 'list'>('grid');

  title = computed(() => `${this.vehicle().year} ${this.vehicle().make} ${this.vehicle().model}`);
  photo = computed(() => this.vehicles.photoUrl(this.vehicle().coverPhotoId));

  // Firebase manda; si aún no llega, usamos lo de PostgreSQL
  currentBid = computed(() => this.live()?.currentBid ?? this.vehicle().auction.currentBid ?? 0);
  bids = computed(() => this.live()?.bidCount ?? this.vehicle().auction.totalBids);
  startsAt = computed(() => this.live()?.startsAt ?? new Date(this.vehicle().auction.startsAt).getTime());
  endsAt = computed(() => this.live()?.endsAt ?? new Date(this.vehicle().auction.endsAt).getTime());
  remaining = computed(() => Math.max(0, this.endsAt() - this.now()));

  state = computed<'scheduled' | 'live' | 'final' | 'closed'>(() => {
    const status = this.live()?.status ?? this.vehicle().auction.status.toLowerCase();
    if (status === 'sold' || status === 'deserted' || this.remaining() <= 0) return 'closed';
    if (this.now() < this.startsAt()) return 'scheduled';
    return this.remaining() <= 60000 ? 'final' : 'live';
  });

  price = computed(() => {
    const live = this.live();
    if (this.state() === 'closed') {
      return live?.result?.finalPrice || this.vehicle().auction.finalPrice || this.currentBid() || this.vehicle().auction.basePrice;
    }
    return this.currentBid() || this.vehicle().auction.basePrice;
  });

  priceLabel = computed(() => {
    const status = this.live()?.status ?? this.vehicle().auction.status.toLowerCase();
    if (this.state() === 'closed') {
      if (status === 'sold') return 'Vendido';
      if (status === 'deserted') return 'Desierta';
      return 'Cerrada';
    }
    return this.currentBid() > 0 ? 'Oferta actual' : 'Monto base';
  });
}
