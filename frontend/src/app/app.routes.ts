import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/catalog/catalog.component').then((m) => m.CatalogComponent), title: 'Inventario · Martillo Autos' },
  { path: 'vehiculo/:id', loadComponent: () => import('./pages/vehicle-detail/vehicle-detail.component').then((m) => m.VehicleDetailComponent), title: 'Subasta · Martillo Autos' },
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent), title: 'Iniciar sesión · Martillo Autos' },
  { path: 'publicar', canActivate: [authGuard], loadComponent: () => import('./pages/publish/publish.component').then((m) => m.PublishComponent), title: 'Publicar vehículo · Martillo Autos' },
  { path: 'publicar/:id', canActivate: [authGuard], loadComponent: () => import('./pages/publish/publish.component').then((m) => m.PublishComponent), title: 'Editar publicación · Martillo Autos' },
  { path: 'mis-publicaciones', canActivate: [authGuard], loadComponent: () => import('./pages/my-listings/my-listings.component').then((m) => m.MyListingsComponent), title: 'Mis publicaciones · Martillo Autos' },
  { path: '**', redirectTo: '' },
];
