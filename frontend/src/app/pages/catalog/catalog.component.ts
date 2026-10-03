import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, catchError, of, switchMap, tap } from 'rxjs';
import { Catalogs, FacetEntry, Facets, LiveAuction, VehicleCard } from '../../core/models/models';
import { CatalogQuery, VehicleService } from '../../core/services/vehicle.service';
import { LiveAuctionService } from '../../core/services/live-auction.service';
import { ClockService } from '../../core/services/clock.service';
import { VehicleCardComponent } from '../../shared/vehicle-card.component';

type ListKey = 'itemTypeId' | 'makeId' | 'modelId' | 'fuelTypeId' | 'transmissionId' | 'drivetrainId' | 'cylinders' | 'damage';

interface Chip { key: ListKey | 'year' | 'search'; value?: number | string; label: string; }

const CYLINDER_OPTIONS = [0, 3, 4, 5, 6, 8, 10, 12];

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [FormsModule, VehicleCardComponent],
  templateUrl: './catalog.component.html',
  styleUrl: './catalog.component.css',
})
export class CatalogComponent implements OnInit {
  private vehicles = inject(VehicleService);
  private liveSvc = inject(LiveAuctionService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  clock = inject(ClockService);

  readonly cylinderOptions = CYLINDER_OPTIONS;
  readonly simpleSections: { name: string; title: string; key: ListKey; facet: 'fuelTypes' | 'transmissions' | 'drivetrains' }[] = [
    { name: 'fuel', title: 'Combustible', key: 'fuelTypeId', facet: 'fuelTypes' },
    { name: 'transmission', title: 'Transmisión', key: 'transmissionId', facet: 'transmissions' },
    { name: 'drivetrain', title: 'Tren de manejo', key: 'drivetrainId', facet: 'drivetrains' },
  ];

  // ---- Estado de filtros ----
  tab = signal<'open' | 'closed'>('open');
  search = signal('');
  selected = signal<Record<ListKey, (number | string)[]>>({
    itemTypeId: [], makeId: [], modelId: [], fuelTypeId: [], transmissionId: [], drivetrainId: [], cylinders: [], damage: [],
  });
  yearFrom = signal<number | null>(null);
  yearTo = signal<number | null>(null);
  sort = signal('ending');
  layout = signal<'grid' | 'list'>('grid');
  page = signal(1);
  readonly pageSize = 12;

  // ---- Datos ----
  items = signal<VehicleCard[]>([]);
  total = signal(0);
  loading = signal(true);
  error = signal('');
  facets = signal<Facets | null>(null);
  catalogs = signal<Catalogs | null>(null);
  live = signal<Record<string, LiveAuction>>({});

  // ---- UI ----
  filtersOpen = signal(false);
  makeTerm = signal('');
  showAllMakes = signal(false);
  openSections = signal<Record<string, boolean>>({ itemType: true, damage: true, make: true, model: true, year: false, fuel: false, transmission: false, drivetrain: false, cylinders: false });

  totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  visibleMakes = computed(() => {
    const term = this.makeTerm().toLowerCase();
    const list = (this.facets()?.makes ?? []).filter((m) => m.name.toLowerCase().includes(term));
    return this.showAllMakes() || term ? list : list.slice(0, 8);
  });

  availableModels = computed(() => {
    const makes = this.selected().makeId;
    if (!makes.length) return [];
    return (this.catalogs()?.models ?? []).filter((m) => makes.includes(m.makeId!));
  });

  chips = computed<Chip[]>(() => {
    const out: Chip[] = [];
    const f = this.facets();
    const c = this.catalogs();
    const s = this.selected();
    const nameIn = (list: FacetEntry[] | undefined, id: number | string) => list?.find((x) => x.id === id)?.name ?? String(id);
    if (this.search()) out.push({ key: 'search', label: `“${this.search()}”` });
    s.itemTypeId.forEach((id) => out.push({ key: 'itemTypeId', value: id, label: nameIn(f?.itemTypes, id) }));
    s.damage.forEach((id) => out.push({ key: 'damage', value: id, label: `Daño ${nameIn(f?.damage, id).toLowerCase()}` }));
    s.makeId.forEach((id) => out.push({ key: 'makeId', value: id, label: nameIn(f?.makes, id) }));
    s.modelId.forEach((id) => out.push({ key: 'modelId', value: id, label: c?.models.find((m) => m.id === id)?.name ?? String(id) }));
    s.fuelTypeId.forEach((id) => out.push({ key: 'fuelTypeId', value: id, label: nameIn(f?.fuelTypes, id) }));
    s.transmissionId.forEach((id) => out.push({ key: 'transmissionId', value: id, label: nameIn(f?.transmissions, id) }));
    s.drivetrainId.forEach((id) => out.push({ key: 'drivetrainId', value: id, label: nameIn(f?.drivetrains, id) }));
    s.cylinders.forEach((n) => out.push({ key: 'cylinders', value: n, label: n === 0 ? 'Eléctrico (0 cil.)' : `${n} cilindros` }));
    if (this.yearFrom() || this.yearTo()) {
      out.push({ key: 'year', label: `Año ${this.yearFrom() ?? '…'} – ${this.yearTo() ?? '…'}` });
    }
    return out;
  });

  private reload$ = new Subject<void>();

  ngOnInit(): void {
    this.vehicles.catalogs().pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((c) => this.catalogs.set(c));

    this.liveSvc.allAuctions().pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((map) => this.live.set(map));

    this.reload$.pipe(
      tap(() => { this.loading.set(true); this.error.set(''); }),
      switchMap(() => this.vehicles.list(this.buildQuery()).pipe(
        catchError(() => { this.error.set('No se pudo cargar el inventario. Revisa tu conexión e intenta de nuevo.'); return of(null); }),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((res) => {
      this.loading.set(false);
      if (!res) return;
      this.items.set(res.items);
      this.total.set(res.total);
    });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.search.set(params.get('search') ?? '');
      this.page.set(1);
      this.reload$.next();
    });

    this.loadFacets();
  }

  private buildQuery(): CatalogQuery {
    const s = this.selected();
    return {
      tab: this.tab(),
      search: this.search(),
      itemTypeId: s.itemTypeId as number[],
      makeId: s.makeId as number[],
      modelId: s.modelId as number[],
      fuelTypeId: s.fuelTypeId as number[],
      transmissionId: s.transmissionId as number[],
      drivetrainId: s.drivetrainId as number[],
      cylinders: s.cylinders as number[],
      damage: s.damage as string[],
      yearFrom: this.yearFrom(),
      yearTo: this.yearTo(),
      sort: this.sort(),
      page: this.page(),
      pageSize: this.pageSize,
    };
  }

  private loadFacets(): void {
    this.vehicles.facets(this.tab()).subscribe({ next: (f) => this.facets.set(f), error: () => this.facets.set(null) });
  }

  private refresh(): void {
    this.page.set(1);
    this.reload$.next();
  }

  // ---- Acciones ----
  setTab(tab: 'open' | 'closed'): void {
    if (this.tab() === tab) return;
    this.tab.set(tab);
    this.loadFacets();
    this.refresh();
  }

  isChecked(key: ListKey, value: number | string): boolean {
    return this.selected()[key].includes(value);
  }

  toggle(key: ListKey, value: number | string): void {
    this.selected.update((s) => {
      const list = s[key].includes(value) ? s[key].filter((v) => v !== value) : [...s[key], value];
      const next = { ...s, [key]: list };
      // Si se quita una marca, quitar sus modelos
      if (key === 'makeId') {
        const models = this.catalogs()?.models ?? [];
        next.modelId = next.modelId.filter((id) => list.includes(models.find((m) => m.id === id)?.makeId ?? -1));
      }
      return next;
    });
    this.refresh();
  }

  applyYears(): void { this.refresh(); }

  removeChip(chip: Chip): void {
    if (chip.key === 'search') { this.search.set(''); this.refresh(); return; }
    if (chip.key === 'year') { this.yearFrom.set(null); this.yearTo.set(null); this.refresh(); return; }
    this.toggle(chip.key, chip.value!);
  }

  clearAll(): void {
    this.selected.set({ itemTypeId: [], makeId: [], modelId: [], fuelTypeId: [], transmissionId: [], drivetrainId: [], cylinders: [], damage: [] });
    this.yearFrom.set(null);
    this.yearTo.set(null);
    this.search.set('');
    this.refresh();
  }

  setSort(value: string): void { this.sort.set(value); this.refresh(); }

  goTo(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.totalPages()));
    this.reload$.next();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toggleSection(name: string): void {
    this.openSections.update((s) => ({ ...s, [name]: !s[name] }));
  }

  /** Chips superiores de tipo de artículo (selección única rápida). */
  quickType(id: number | string): void {
    const already = this.selected().itemTypeId.length === 1 && this.selected().itemTypeId[0] === id;
    this.selected.update((s) => ({ ...s, itemTypeId: already ? [] : [id] }));
    this.refresh();
  }

  countFor(list: FacetEntry[] | undefined, id: number | string): number {
    return list?.find((x) => x.id === id)?.count ?? 0;
  }
}
