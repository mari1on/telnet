import { Component, inject } from '@angular/core';
import { ApiService } from './api.service';
import { LoginComponent } from './components/login';
import { DashboardComponent } from './components/dashboard';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LoginComponent, DashboardComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly apiService = inject(ApiService);
}
