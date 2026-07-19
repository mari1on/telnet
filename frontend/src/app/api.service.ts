import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap, timeout } from 'rxjs/operators';

export interface User {
  id?: number;
  username: string;
  email: string;
  role: string;
  token?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly baseUrl = 'http://localhost:8081/api';

  // Signals for state management
  readonly currentUser = signal<User | null>(this.getStoredUser());
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly isRssi = computed(() => this.currentUser()?.role === 'ROLE_ADMIN' || this.currentUser()?.role === 'ADMIN' || this.currentUser()?.role === 'RSSI');

  constructor(private http: HttpClient) {}

  private getStoredUser(): User | null {
    const userJson = localStorage.getItem('telnet_user');
    if (userJson) {
      try {
        return JSON.parse(userJson);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  private getHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    const user = this.currentUser();
    if (user && user.token) {
      headers = headers.set('Authorization', `Bearer ${user.token}`);
    } else if (user) {
      // Fallback for transition
      headers = headers.set('X-User-Username', user.username);
    }
    return headers;
  }

  login(credentials: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/auth/signin`, credentials).pipe(
      tap(response => {
        const user: User = {
          id: response.id,
          username: response.username,
          email: response.email,
          role: response.role,
          token: response.token
        };
        localStorage.setItem('telnet_user', JSON.stringify(user));
        this.currentUser.set(user);
      })
    );
  }

  signup(userData: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/auth/signup`, userData);
  }

  requestPasswordReset(identifier: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/auth/forgot-password`, { identifier });
  }

  resetPassword(payload: { identifier: string; code: string; newPassword: string }): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/auth/reset-password`, payload);
  }

  logout(): void {
    localStorage.removeItem('telnet_user');
    this.currentUser.set(null);
  }

  updateUserProfile(
    _id: number,
    profile: {
      username: string;
      email: string;
      role: string;
      currentPassword?: string;
      newPassword?: string;
    }
  ): Observable<User> {
    return this.http.put<any>(`${this.baseUrl}/auth/profile`, {
      username: profile.username,
      email: profile.email,
      currentPassword: profile.currentPassword,
      newPassword: profile.newPassword
    }, { headers: this.getHeaders() }).pipe(
      tap(updated => {
        const user = this.currentUser();
        if (!user) return;
        const updatedUser: User = {
          ...user,
          username: updated.username,
          email: updated.email,
          role: updated.role ?? user.role,
          token: updated.token || user.token
        };
        localStorage.setItem('telnet_user', JSON.stringify(updatedUser));
        this.currentUser.set(updatedUser);
      })
    );
  }

  // --- Evenements ---
  getEvents(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/evenements`, { headers: this.getHeaders() });
  }

  getEventById(id: number): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/evenements/${id}`, { headers: this.getHeaders() });
  }

  createEvent(event: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/evenements`, event, { headers: this.getHeaders() });
  }

  updateEvent(id: number, event: any): Observable<any> {
    return this.http.put<any>(`${this.baseUrl}/evenements/${id}`, event, { headers: this.getHeaders() });
  }

  qualifyEvent(id: number, qualification: {
    typeActif?: string;
    actifAffecte?: string;
    impactConfidentialite: string;
    impactIntegrite: string;
    impactDisponibilite: string;
    commentaireConfidentialite?: string;
    commentaireIntegrite?: string;
    commentaireDisponibilite?: string;
  }): Observable<any> {
    return this.http.put<any>(`${this.baseUrl}/evenements/${id}/qualification`, qualification, { headers: this.getHeaders() });
  }

  deleteEvent(id: number): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/evenements/${id}`, { headers: this.getHeaders() });
  }

  notifyRssiEvent(id: number): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/evenements/${id}/notify-rssi`, {}, { headers: this.getHeaders() });
  }

  // --- Incidents ---
  getIncidents(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/incidents`, { headers: this.getHeaders() });
  }

  getIncidentById(id: number): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/incidents/${id}`, { headers: this.getHeaders() });
  }

  createIncident(incident: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/incidents`, incident, { headers: this.getHeaders() });
  }

  updateIncident(id: number, incident: any): Observable<any> {
    return this.http.put<any>(`${this.baseUrl}/incidents/${id}`, incident, { headers: this.getHeaders() });
  }

  saveIncidentPlan(incident: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/incidents/save-plan`, incident, { headers: this.getHeaders() });
  }

  getIncidentSaveVersion(): Observable<{ version: string }> {
    return this.http.get<{ version: string }>(`${this.baseUrl}/incidents/save-plan/version`, { headers: this.getHeaders() });
  }

  deleteIncident(id: number): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/incidents/${id}`, { headers: this.getHeaders() });
  }

  // --- Risques ---
  getRisks(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/risques`, { headers: this.getHeaders() });
  }


  // --- Assistant RSSI local (moteur Python sans API externe) ---
  runLocalRssiAssistant(payload: { eventId?: number | null; question: string; history?: Array<{ role: 'assistant' | 'user'; text: string }> }): Observable<any> {
    return this.http.post<any>(
      `${this.baseUrl}/rssi-assistant/analyze`,
      payload,
      { headers: this.getHeaders() }
    ).pipe(timeout(35000));
  }

  generateLocalAiText(payload: {
    purpose: string;
    field: string;
    seed: string;
    event?: Record<string, unknown>;
    incident?: Record<string, unknown>;
  }): Observable<{ text: string; engine?: string; modelAvailable?: boolean; diagnostic?: string }> {
    return this.http.post<{ text: string; engine?: string; modelAvailable?: boolean; diagnostic?: string }>(
      `${this.baseUrl}/rssi-assistant/generate-text`,
      payload,
      { headers: this.getHeaders() }
    );
  }

  // --- Logs ---
  getLogs(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/logs`, { headers: this.getHeaders() });
  }
}
