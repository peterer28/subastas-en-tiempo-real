import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, startWith, switchMap } from 'rxjs';
import { LiveAuction, VehicleCard } from '../../core/models/models';
import { VehicleService } from '../../core/services/vehicle.service';
import { LiveAuctionService } from '../../core/services/live-auction.service';
import { ClockService } from '../../core/services/clock.service';
import { QuetzalPipe, RemainingPipe, WhenPipe } from '../../shared/format';

@Component({
  selector: 'app-my-listings',
  standalone: true,
  imports: [FormsModule, RouterLink, QuetzalPipe, RemainingPipe, WhenPipe],
  template: `
    <section class="wrap page">
      <div class="head">
        <div>
          <h1>Mis publicaciones</h1>
          <p class="lead">Busca tus vehículos para revisarlos o editarlos. Solo puedes editar mientras no tengan ofertas.</p>
        </div>
        <a class="btn btn-primary" routerLink="/publicar">Publicar vehículo</a>
      </div>

      <input class="input search" type="search" placeholder="Buscar por marca, modelo, año o lote"
             [ngModel]="term()" (ngModelChange)="term.set($event); search$.next($event)">

      @if (loading()) {
        <p class="lead">Cargando…</p>
      } @else if (!items().length) {
        <div class="empty">
          <h2>{{ term() ? 'Ninguna publicación coincide' : 'Aún no publicas vehículos' }}</h2>
          <p>{{ term() ? 'Prueba con otra palabra.' : 'Publica tu primer vehículo y empieza a recibir ofertas.' }}</p>
          @if (!term()) { <a class="btn btn-outline" routerLink="/publicar">Publicar vehículo</a> }
        </div>
      } @else {
        <ul class="rows">
          @for (v of items(); track v.id) {
            @let a = live()[v.auction.id];
            <li class="row">
              <img [src]="photo(v.coverPhotoId)" alt="" loading="lazy">
              <div class="info">
                <a [routerLink]="['/vehiculo', v.id]" class="title">{{ v.year }} {{ v.make }} {{ v.model }}</a>
                <span class="sub">Lote {{ v.lotNumber }}, {{ v.location }}</span>
                <span class="dmg dmg-{{ v.damage.code }}">{{ v.damage.name }}</span>
              </div>
              <div class="money">
                <span class="num amount">{{ (a?.currentBid || v.auction.currentBid || v.auction.basePrice) | q }}</span>
                <span class="sub">{{ (a?.bidCount ?? v.auction.totalBids) > 0 ? (a?.bidCount ?? v.auction.totalBids) + ' ofertas' : 'Monto base' }}</span>
              </div>
              <div class="status">
                <span class="state state-{{ statusOf(v, a) }}">{{ statusLabel(statusOf(v, a)) }}</span>
                @if (statusOf(v, a) === 'live') {
                  <span class="sub num">Cierra en {{ (a?.endsAt ?? 0) - clock.now() | remaining }}</span>
                } @else if (statusOf(v, a) === 'scheduled') {
                  <span class="sub">Inicia {{ v.auction.startsAt | when }}</span>
                }
              </div>
              <div class="actions">
                @if (v.editable && (a?.bidCount ?? 0) === 0 && statusOf(v, a) !== 'closed') {
                  <a class="btn btn-outline" [routerLink]="['/publicar', v.id]">Editar</a>
                } @else {
                  <span class="locked" title="Ya tiene ofertas o está cerrada">No editable</span>
                }
                <a class="btn btn-quiet" [routerLink]="['/vehiculo', v.id]">Ver</a>
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [`
    .page { padding-top: 28px; padding-bottom: 64px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
    .lead { color: var(--ink-soft); margin: 6px 0 0; }
    .search { margin: 20px 0 16px; max-width: 460px; border-radius: var(--radius-pill); padding-left: 18px; }
    .rows { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
    .row { display: grid; grid-template-columns: 120px 1.4fr 1fr 1fr auto; gap: 18px; align-items: center; background: var(--paper);
           border: 1px solid var(--line); border-radius: var(--radius-card); padding: 10px 16px 10px 10px; }
    .row img { width: 120px; height: 84px; object-fit: cover; border-radius: 6px; background: var(--canvas); }
    .info, .money, .status { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
    .title { font-weight: 600; text-decoration: none; }
    .title:hover { color: var(--signal); }
    .sub { color: var(--ink-soft); font-size: .84rem; }
    .amount { font-size: 1.35rem; font-weight: 700; }
    .state { font-size: .8rem; font-weight: 600; padding: 2px 10px; border-radius: var(--radius-pill); }
    .state-live { background: var(--signal-soft); color: var(--signal-hover); }
    .state-scheduled { background: var(--sky-soft); color: #2d5f8f; }
    .state-sold { background: var(--dmg-green-soft); color: #1f7a45; }
    .state-deserted, .state-closed { background: #eef0f2; color: var(--ink-soft); }
    .actions { display: flex; gap: 8px; align-items: center; }
    .locked { font-size: .82rem; color: var(--ink-faint); padding: 0 6px; }
    .empty { background: var(--paper); border: 1px dashed var(--line-strong); border-radius: var(--radius-card); padding: 48px 24px; text-align: center; }
    .empty p { color: var(--ink-soft); }
    @media (max-width: 900px) {
      .row { grid-template-columns: 96px 1fr; }
      .row img { width: 96px; height: 72px; grid-row: span 2; }
      .money, .status { grid-column: 2; }
      .actions { grid-column: 1 / -1; justify-content: flex-end; }
    }
  `],
})
export class MyListingsComponent implements OnInit {
  private vehicles = inject(VehicleService);
  private liveSvc = inject(LiveAuctionService);
  private destroyRef = inject(DestroyRef);
  clock = inject(ClockService);

  term = signal('');
  items = signal<VehicleCard[]>([]);
  loading = signal(true);
  live = signal<Record<string, LiveAuction>>({});
  search$ = new Subject<string>();

  ngOnInit(): void {
    this.search$.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged(),
      switchMap((t) => this.vehicles.mine(t.trim())),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (list) => { this.items.set(list); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.liveSvc.allAuctions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((m) => this.live.set(m));
  }

  photo(id: string | null): string { return this.vehicles.photoUrl(id); }

  statusOf(v: VehicleCard, a?: LiveAuction): 'scheduled' | 'live' | 'sold' | 'deserted' | 'closed' {
    const status = a?.status ?? v.auction.status.toLowerCase();
    if (status === 'sold' || status === 'deserted') return status;
    const ends = a?.endsAt ?? new Date(v.auction.endsAt).getTime();
    if (ends <= this.clock.now()) return 'closed';
    const starts = a?.startsAt ?? new Date(v.auction.startsAt).getTime();
    return starts > this.clock.now() ? 'scheduled' : 'live';
  }

  statusLabel(s: string): string {
    return ({ scheduled: 'Programada', live: 'En subasta', sold: 'Vendida', deserted: 'Desierta', closed: 'Cerrando…' } as Record<string, string>)[s];
  }
}
