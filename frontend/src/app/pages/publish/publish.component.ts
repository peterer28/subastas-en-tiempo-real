import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiError, Catalogs } from '../../core/models/models';
import { VehicleService } from '../../core/services/vehicle.service';

type PhotoEntry =
  | { kind: 'existing'; id: string; url: string }
  | { kind: 'new'; file: File; url: string };

const MIN_PHOTOS = 5;
const MAX_PHOTOS = 15;

/** Reduce la foto a máx. 1600 px y JPEG 85 % antes de subirla. */
async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.85));
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

/** Date → valor para <input type="datetime-local"> en hora local. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

@Component({
  selector: 'app-publish',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './publish.component.html',
  styleUrl: './publish.component.css',
})
export class PublishComponent implements OnInit, OnDestroy {
  private vehicles = inject(VehicleService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly minPhotos = MIN_PHOTOS;
  readonly maxPhotos = MAX_PHOTOS;
  readonly currentYear = new Date().getFullYear();

  editId = this.route.snapshot.paramMap.get('id');
  catalogs = signal<Catalogs | null>(null);
  loading = signal(true);
  saving = signal(false);
  locked = signal('');
  error = signal('');
  errors = signal<Record<string, string>>({});
  photos = signal<PhotoEntry[]>([]);
  dragOver = signal(false);

  form = {
    year: null as number | null,
    itemTypeId: null as number | null,
    makeId: null as number | null,
    modelId: null as number | null,
    engine: '',
    transmissionId: null as number | null,
    fuelTypeId: null as number | null,
    drivetrainId: null as number | null,
    cylinders: null as number | null,
    damageLevelId: null as number | null,
    mileage: null as number | null,
    vin: '',
    location: '',
    description: '',
    basePrice: null as number | null,
    startsAt: toLocalInput(new Date(Date.now() + 5 * 60000)),
    endsAt: toLocalInput(new Date(Date.now() + 3 * 86400000)),
  };
  makeId = signal<number | null>(null);

  models = computed(() => (this.catalogs()?.models ?? []).filter((m) => m.makeId === this.makeId()));
  photoCount = computed(() => this.photos().length);

  ngOnInit(): void {
    this.vehicles.catalogs().subscribe({
      next: (c) => {
        this.catalogs.set(c);
        if (!this.editId) this.loading.set(false);
      },
      error: () => this.error.set('No se pudieron cargar los catálogos. Recarga la página.'),
    });

    if (this.editId) {
      this.vehicles.detail(this.editId).subscribe({
        next: (v) => {
          if (!v.isOwner) { this.router.navigate(['/vehiculo', v.id]); return; }
          if (v.auction.totalBids > 0 || !['SCHEDULED', 'LIVE'].includes(v.auction.status)) {
            this.locked.set('Esta publicación ya recibió ofertas o está cerrada, por eso no se puede editar.');
          }
          Object.assign(this.form, {
            year: v.year, engine: v.engine, cylinders: v.cylinders, mileage: v.mileage,
            location: v.location, description: v.description ?? '', basePrice: v.auction.basePrice,
            startsAt: toLocalInput(new Date(v.auction.startsAt)),
            endsAt: toLocalInput(new Date(v.auction.endsAt)),
            ...v.ids,
          });
          this.makeId.set(v.ids.makeId);
          this.photos.set(v.photoIds.map((id) => ({ kind: 'existing' as const, id, url: this.vehicles.photoUrl(id) })));
          this.loading.set(false);
        },
        error: () => this.error.set('No se encontró la publicación.'),
      });
    }
  }

  ngOnDestroy(): void {
    this.photos().forEach((p) => p.kind === 'new' && URL.revokeObjectURL(p.url));
  }

  onMakeChange(id: number | null): void {
    this.form.makeId = id;
    this.form.modelId = null;
    this.makeId.set(id);
  }

  selectDamage(id: number): void { this.form.damageLevelId = id; }

  async addFiles(list: FileList | null): Promise<void> {
    if (!list) return;
    const room = MAX_PHOTOS - this.photos().length;
    const files = Array.from(list).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type)).slice(0, room);
    for (const raw of files) {
      const file = raw.size > 900_000 ? await compressImage(raw).catch(() => raw) : raw;
      this.photos.update((p) => [...p, { kind: 'new', file, url: URL.createObjectURL(file) }]);
    }
    this.errors.update((e) => ({ ...e, photos: '' }));
  }

  onFileInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.addFiles(input.files).then(() => (input.value = ''));
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragOver.set(false);
    this.addFiles(e.dataTransfer?.files ?? null);
  }

  removePhoto(i: number): void {
    const p = this.photos()[i];
    if (p.kind === 'new') URL.revokeObjectURL(p.url);
    this.photos.update((list) => list.filter((_, idx) => idx !== i));
  }

  makeCover(i: number): void {
    this.photos.update((list) => [list[i], ...list.filter((_, idx) => idx !== i)]);
  }

  private validate(): boolean {
    const f = this.form;
    const e: Record<string, string> = {};
    const req: (keyof typeof f)[] = ['year', 'itemTypeId', 'makeId', 'modelId', 'engine', 'transmissionId',
      'fuelTypeId', 'drivetrainId', 'cylinders', 'damageLevelId', 'basePrice', 'startsAt', 'endsAt'];
    for (const k of req) if (f[k] === null || f[k] === '') e[k] = 'Campo obligatorio.';
    if (f.basePrice !== null && f.basePrice < 1) e['basePrice'] = 'El monto base debe ser mayor a 0.';
    if (f.startsAt && f.endsAt && new Date(f.endsAt) <= new Date(f.startsAt)) e['endsAt'] = 'El cierre debe ser después del inicio.';
    if (this.photos().length < MIN_PHOTOS) e['photos'] = `Sube al menos ${MIN_PHOTOS} fotografías (llevas ${this.photos().length}).`;
    this.errors.set(e);
    return Object.keys(e).length === 0;
  }

  save(): void {
    if (this.locked() || this.saving()) return;
    if (!this.validate()) {
      this.error.set('Revisa los campos marcados.');
      document.querySelector('.invalid, .field-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const f = this.form;
    const data = new FormData();
    const fields: Record<string, unknown> = {
      year: f.year, itemTypeId: f.itemTypeId, makeId: f.makeId, modelId: f.modelId, engine: f.engine,
      transmissionId: f.transmissionId, fuelTypeId: f.fuelTypeId, drivetrainId: f.drivetrainId,
      cylinders: f.cylinders, damageLevelId: f.damageLevelId, mileage: f.mileage ?? '', vin: f.vin,
      location: f.location, description: f.description, basePrice: f.basePrice,
      startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(),
    };
    Object.entries(fields).forEach(([k, v]) => data.append(k, String(v ?? '')));

    // Las fotos existentes conservan su orden; las nuevas se agregan al final en el orden mostrado.
    const keep = this.photos().filter((p) => p.kind === 'existing').map((p) => (p as { id: string }).id);
    data.append('keepPhotoIds', JSON.stringify(keep));
    this.photos().forEach((p) => { if (p.kind === 'new') data.append('photos', p.file, p.file.name); });

    this.saving.set(true);
    this.error.set('');
    const req = this.editId ? this.vehicles.update(this.editId, data) : this.vehicles.create(data);
    req.subscribe({
      next: (r) => {
        this.saving.set(false);
        this.router.navigate(['/vehiculo', r.id], { state: { toast: this.editId ? 'Publicación actualizada.' : 'Vehículo publicado.' } });
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const body = err.error as ApiError | null;
        this.errors.set(body?.errors ?? {});
        this.error.set(body?.message ?? 'No se pudo guardar. Intenta de nuevo.');
      },
    });
  }
}
