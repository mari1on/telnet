import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, User } from '../api.service';

interface Evenement {
  id?: number;
  descriptionDetaillee: string;
  dateHeureDetection: string;
  detecteParSource: string;
  idTicket: string;
  commentaireSource: string;
  natureEvenement: string;
  serviceOsAppli: string;
  equipementHardware: string;
  libelleErreur: string;
  codeErreur: string;
  causesPossibles: string;
  etat: string;
  appreciation: string;
  evaluation: string;
  impact: string;
  impactNiveau: string;
  impactMineur: boolean;
  impactCommentaire: string;
  typeActif: string;
  actifAffecte: string;
  qualification?: string;
  qualifiePar?: string;
  declarePar?: string;
  impactConfidentialite?: string;
  commentaireConfidentialite?: string;
  impactIntegrite?: string;
  commentaireIntegrite?: string;
  impactDisponibilite?: string;
  commentaireDisponibilite?: string;
}

interface Risque {
  id?: number;
  reference: string;
  description: string;
}

interface Incident {
  id?: number;
  typesIncident: string[];
  niveauImpact: string;
  dureeIndisponibilite: string;
  mesureActionNumero: string;
  mesureAction: string;
  mesureResponsable: string;
  mesureDelai: string;
  mesureEtat: string;
  mesureDDT: string;
  dureeAttenuation: string;
  heureAttenuation: string;
  traitementAction: string;
  traitementDDT: string;
  traitementHDT: string;
  traitementResponsable: string;
  traitementEtat: string;
  traitementDateCloture: string;
  traitementHeureCloture: string;
  dureeTraitement: string;
  heureTraitement: string;
  preconisation: string;
  actionCorrective: string;
  correctiveResponsable: string;
  correctiveDateDebut: string;
  correctiveDateCloture: string;
  dateMesureEfficacite: string;
  efficacite: string;
  commentaireEfficacite: string;
  hasRisquesAssocies: boolean;
  impactContinuite: boolean;
  impactContinuiteDescription: string;
  capitalisation: boolean;
  evenementsSimilaires: boolean;
  changementDeclenche: boolean;
  changementDeclencheDescription: string;
  miseAJourPcaNecessaire: boolean;
  referencePca: string;
  risques: Risque[];
  risquesAMettreAJour: boolean;
  risquesMiseAJour: string;
  risquesMiseAJourDescription: string;
  suiviEdition: string;
  suiviDate: string;
  suiviAuteur: string;
  suiviCommentaires: string;
  evenement: Partial<Evenement> & { id: number };
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit {
  activeTab = signal<'events' | 'incidents' | 'logs' | 'stats'>('events');

  // Lists
  events = signal<Evenement[]>([]);
  incidents = signal<Incident[]>([]);
  logs = signal<any[]>([]);

  // Selected Items for Forms/Modals
  selectedEvent = signal<Evenement | null>(null);
  selectedIncident = signal<Incident | null>(null);

  // Forms Visibility
  showEventForm = signal(false);
  showIncidentForm = signal(false);
  showQualifyForm = signal(false);
  showUserModal = signal(false);

  // Error/Success messages
  successMsg = signal('');
  errorMsg = signal('');

  // Dropdown list options
  sources = ['HELP_DESK', 'SIEM', 'UTILISATEUR', 'SUPERVISION', 'AUTRE'];
  eventNatures = ['Indisponibilite', 'Degradation', 'Erreur applicative', 'Alerte securite', 'Suspicion de fraude', 'Autre'];
  etatsEvent = ['Ouvert', 'En cours', 'Clos'];
  eventImpactLevels = ['Mineur', 'Majeur'];
  impactOptions = ['Mineur/Aucun', 'Majeur', 'Critique'];
  etatsMesure = ['En cours', 'Terminé', 'En attente'];
  etatsTraitement = ['En cours', 'Clôturé', 'Suspendu'];
  yesNoOptions = [
    { label: 'Non', value: false },
    { label: 'Oui', value: true }
  ];
  incidentImpactLevels = [
    {
      value: 'NIVEAU_1',
      label: 'Niveau 1',
      description: 'Pas d impact sur la continuite de l activite ou du service'
    },
    {
      value: 'NIVEAU_2',
      label: 'Niveau 2',
      description: 'Impact mineur sur la CID d une activite ou d un service'
    },
    {
      value: 'NIVEAU_3',
      label: 'Niveau 3',
      description: 'Impact majeur sur la CID d une activite ou d un service'
    },
    {
      value: 'NIVEAU_4',
      label: 'Niveau 4',
      description: 'Impact definitif sur l entreprise'
    }
  ];
  incidentTypesList = [
    'Défaillance technique',
    'Dommage physique',
    'Accès non autorisé',
    'Déni de service (DoS/DDoS)',
    'Fuite de données',
    'Malware / Virus',
    'Autre'
  ];

  // Event Form Model
  eventForm: Evenement = this.initEventForm();

  // Incident Form Model
  incidentForm: Incident = this.initIncidentForm(0);

  // Qualification Model
  qualifyValue = 'INCIDENT'; // 'INCIDENT' or 'NON_INCIDENT'
  userForm = {
    username: '',
    email: '',
    role: ''
  };

  constructor(protected apiService: ApiService) {}

  ngOnInit(): void {
    this.loadEvents();
    this.loadIncidents();
    this.loadLogs();
  }

  // --- Initializers ---
  initEventForm(): Evenement {
    return {
      descriptionDetaillee: '',
      dateHeureDetection: new Date().toISOString().slice(0, 16),
      detecteParSource: 'HELP_DESK',
      idTicket: '',
      commentaireSource: '',
      natureEvenement: 'Indisponibilite',
      serviceOsAppli: '',
      equipementHardware: '',
      libelleErreur: '',
      codeErreur: '',
      causesPossibles: '',
      etat: 'Ouvert',
      appreciation: '',
      evaluation: '',
      impact: '',
      impactNiveau: 'Mineur',
      impactMineur: false,
      impactCommentaire: '',
      typeActif: '',
      actifAffecte: '',
      qualification: 'NON_QUALIFIE',
      impactConfidentialite: 'Mineur/Aucun',
      commentaireConfidentialite: '',
      impactIntegrite: 'Mineur/Aucun',
      commentaireIntegrite: '',
      impactDisponibilite: 'Mineur/Aucun',
      commentaireDisponibilite: ''
    };
  }

  initIncidentForm(eventId: number): Incident {
    return {
      typesIncident: [],
      niveauImpact: 'NIVEAU_1',
      dureeIndisponibilite: '',
      mesureActionNumero: '',
      mesureAction: '',
      mesureResponsable: '',
      mesureDelai: '',
      mesureEtat: 'En cours',
      mesureDDT: new Date().toISOString().slice(0, 10),
      dureeAttenuation: '',
      heureAttenuation: new Date().toTimeString().slice(0, 5),
      traitementAction: '',
      traitementDDT: new Date().toISOString().slice(0, 10),
      traitementHDT: new Date().toTimeString().slice(0, 5),
      traitementResponsable: '',
      traitementEtat: 'En cours',
      traitementDateCloture: '',
      traitementHeureCloture: '',
      dureeTraitement: '',
      heureTraitement: '',
      preconisation: '',
      actionCorrective: '',
      correctiveResponsable: '',
      correctiveDateDebut: '',
      correctiveDateCloture: '',
      dateMesureEfficacite: '',
      efficacite: '',
      commentaireEfficacite: '',
      hasRisquesAssocies: false,
      impactContinuite: false,
      impactContinuiteDescription: '',
      capitalisation: false,
      evenementsSimilaires: false,
      changementDeclenche: false,
      changementDeclencheDescription: '',
      miseAJourPcaNecessaire: false,
      referencePca: '',
      risques: [],
      risquesAMettreAJour: false,
      risquesMiseAJour: '',
      risquesMiseAJourDescription: '',
      suiviEdition: '1',
      suiviDate: new Date().toISOString().slice(0, 10),
      suiviAuteur: '',
      suiviCommentaires: '',
      evenement: { id: eventId }
    };
  }

  // --- Actions ---
  switchTab(tab: 'events' | 'incidents' | 'logs' | 'stats'): void {
    this.activeTab.set(tab as any);
    this.successMsg.set('');
    this.errorMsg.set('');
    if (tab === 'events') this.loadEvents();
    if (tab === 'incidents') this.loadIncidents();
    if (tab === 'logs') this.loadLogs();
  }

  getNonQualifiedCount(): number {
    return this.events().filter(e => e.qualification === 'NON_QUALIFIE').length;
  }

  getNonQualifiedPercent(): number {
    const total = this.events().length;
    return total === 0 ? 0 : Math.round((this.getNonQualifiedCount() / total) * 100);
  }

  getIncidentCount(): number {
    return this.events().filter(e => e.qualification === 'INCIDENT').length;
  }

  getIncidentPercent(): number {
    const total = this.events().length;
    return total === 0 ? 0 : Math.round((this.getIncidentCount() / total) * 100);
  }
  
  // --- NOUVEAUX KPIs RSSI ---
  
  getIncidentsEnCours(): number {
    return this.incidents().filter(i => i.traitementEtat !== 'Clôturé').length;
  }

  getIncidentsTraites(): number {
    return this.incidents().filter(i => i.traitementEtat === 'Clôturé').length;
  }

  getRisquesTouchesCount(): number {
    return this.incidents().reduce((total, i) => total + (i.risques ? i.risques.length : 0), 0);
  }

  getEvenementsClasses(): number {
    return this.events().filter(e => e.qualification === 'NON_INCIDENT').length;
  }

  // Rough estimation of average duration (indisponibilité) in minutes
  getTempsMoyenIndisponibilite(): string {
    const incs = this.incidents().filter(i => i.dureeIndisponibilite);
    if (incs.length === 0) return 'N/A';
    
    let totalMins = 0;
    incs.forEach(inc => {
      totalMins += this.parseDurationToMinutes(inc.dureeIndisponibilite);
    });
    
    const avg = Math.round(totalMins / incs.length);
    return this.formatMinutesToDuration(avg);
  }

  getTempsMoyenTraitement(): string {
    const incs = this.incidents().filter(i => i.dureeTraitement);
    if (incs.length === 0) return 'N/A';
    
    let totalMins = 0;
    incs.forEach(inc => {
      totalMins += this.parseDurationToMinutes(inc.dureeTraitement);
    });
    
    const avg = Math.round(totalMins / incs.length);
    return this.formatMinutesToDuration(avg);
  }

  private parseDurationToMinutes(durationStr: string): number {
    if (!durationStr) return 0;
    let mins = 0;
    const hMatch = durationStr.match(/(\d+)\s*h/i);
    const mMatch = durationStr.match(/(\d+)\s*m/i);
    if (hMatch) mins += parseInt(hMatch[1], 10) * 60;
    if (mMatch) mins += parseInt(mMatch[1], 10);
    return mins;
  }

  private formatMinutesToDuration(mins: number): string {
    const hours = Math.floor(mins / 60);
    const m = mins % 60;
    return hours > 0 ? `${hours}h ${m}m` : `${m}m`;
  }

  getRisquesList() {
    return this.incidents().flatMap(i => 
      (i.risques || []).map(r => ({
        ref: r.reference,
        desc: r.description,
        incidentId: i.id
      }))
    );
  }

  getEventsByYear() {
    // Group events by YYYY-MM
    const groups: { [key: string]: number } = {};
    this.events().forEach(e => {
      const ym = e.dateHeureDetection ? e.dateHeureDetection.slice(0, 7) : 'Inconnu';
      groups[ym] = (groups[ym] || 0) + 1;
    });
    return Object.keys(groups).sort().map(k => ({ date: k, count: groups[k] }));
  }

  getTempsTraitementChartData() {
    return this.incidents()
      .filter(i => i.dureeTraitement)
      .map(i => {
        const mins = this.parseDurationToMinutes(i.dureeTraitement);
        const pct = Math.min(100, Math.max(5, (mins / 500) * 100));
        return {
          incidentId: i.id,
          minutes: mins,
          label: i.dureeTraitement,
          heightPct: pct
        };
      })
      .slice(-10); // Show last 10 incidents
  }

  getIncidentsByEtat() {
    const groups: { [key: string]: number } = {
      'Ouvert': 0,
      'En cours': 0,
      'Clos': 0
    };
    this.incidents().forEach(i => {
      const etat = i.evenement?.etat || 'Inconnu';
      if (groups[etat] !== undefined) {
        groups[etat]++;
      } else {
        groups[etat] = 1;
      }
    });
    return Object.keys(groups).map(k => ({ etat: k, count: groups[k] }));
  }

  getEventsByNature() {
    const groups: { [key: string]: number } = {};
    this.events().forEach(e => {
      const nature = e.natureEvenement || 'Autre';
      groups[nature] = (groups[nature] || 0) + 1;
    });
    return Object.keys(groups).map(k => ({ nature: k, count: groups[k] }));
  }

  // --------------------------

  getIncidentEvent(incident: Incident): Evenement | undefined {
    const embedded = incident.evenement as Partial<Evenement> | undefined;
    if (embedded?.id && (embedded.libelleErreur || embedded.descriptionDetaillee || embedded.natureEvenement || embedded.dateHeureDetection)) {
      return embedded as Evenement;
    }
    return this.events().find(event => event.id === embedded?.id);
  }

  getImpactLevelDescription(value?: string): string {
    return this.incidentImpactLevels.find(level => level.value === value)?.description || '';
  }

  private isFilled(value?: string | null): boolean {
    return (value || '').trim().length > 0;
  }

  private sanitizeIncidentPayload(incident: Incident): Incident {
    const payload = { ...incident };
    const dateFields: (keyof Incident)[] = [
      'mesureDDT', 'traitementDDT', 'traitementDateCloture',
      'correctiveDateDebut', 'correctiveDateCloture', 'dateMesureEfficacite', 'suiviDate',
      'heureAttenuation', 'traitementHDT', 'traitementHeureCloture', 'heureTraitement'
    ];
    dateFields.forEach(field => {
      if (payload[field] === '') {
        (payload as any)[field] = null;
      }
    });
    return payload;
  }

  private prepareIncidentFormDefaults(): void {
    this.incidentForm = {
      ...this.initIncidentForm(this.incidentForm.evenement?.id || 0),
      ...this.incidentForm,
      evenement: { ...(this.incidentForm.evenement || {}), id: this.incidentForm.evenement?.id || 0 }
    };

    this.incidentForm.typesIncident = this.incidentForm.typesIncident || [];
    this.incidentForm.hasRisquesAssocies = this.incidentForm.hasRisquesAssocies ?? false;
    this.incidentForm.impactContinuite = this.incidentForm.impactContinuite ?? false;
    this.incidentForm.capitalisation = this.incidentForm.capitalisation ?? false;
    this.incidentForm.evenementsSimilaires = this.incidentForm.evenementsSimilaires ?? false;
    this.incidentForm.changementDeclenche = this.incidentForm.changementDeclenche ?? false;
    this.incidentForm.miseAJourPcaNecessaire = this.incidentForm.miseAJourPcaNecessaire ?? false;
    this.incidentForm.risquesAMettreAJour = this.incidentForm.risquesAMettreAJour ?? false;
    this.incidentForm.suiviAuteur = this.incidentForm.suiviAuteur || this.apiService.currentUser()?.username || '';
    this.incidentForm.suiviDate = this.toDateInputValue(this.incidentForm.suiviDate) || new Date().toISOString().slice(0, 10);
  }

  loadEvents(): void {
    this.apiService.getEvents().subscribe({
      next: (data) => {
        this.events.set(data);
        // Retro-create missing incidents for any event qualified as INCIDENT
        const incidents = this.incidents();
        data.forEach(event => {
          if (event.qualification === 'INCIDENT' && !incidents.find(inc => inc.evenement?.id === event.id)) {
             const newIncident = this.sanitizeIncidentPayload(this.initIncidentForm(event.id!));
             this.apiService.createIncident(newIncident).subscribe({
               next: (saved) => this.incidents.set([...this.incidents(), saved])
             });
          }
        });
      },
      error: () => this.errorMsg.set('Erreur lors du chargement des événements.')
    });
  }

  loadIncidents(): void {
    this.apiService.getIncidents().subscribe({
      next: (data) => {
        this.incidents.set(data);
        // Retro-create missing incidents for any event qualified as INCIDENT
        const events = this.events();
        if (events.length > 0) {
          events.forEach(event => {
            if (event.qualification === 'INCIDENT' && !data.find(inc => inc.evenement?.id === event.id)) {
               this.apiService.createIncident(this.initIncidentForm(event.id!)).subscribe({
                 next: (saved) => this.incidents.set([...this.incidents(), saved])
               });
            }
          });
        }
      },
      error: () => this.errorMsg.set('Erreur lors du chargement des incidents.')
    });
  }

  loadLogs(): void {
    this.apiService.getLogs().subscribe({
      next: (data) => this.logs.set(data),
      error: () => this.errorMsg.set('Erreur lors du chargement du journal d\'audit.')
    });
  }

  // --- Evenement Operations ---
  openCreateEvent(): void {
    this.eventForm = this.initEventForm();
    this.selectedEvent.set(null);
    this.showEventForm.set(true);
  }

  openUserModal(): void {
    const current = this.apiService.currentUser();
    this.userForm = {
      username: current?.username || '',
      email: current?.email || '',
      role: current?.role || ''
    };
    this.showUserModal.set(true);
  }

  saveUserProfile(): void {
    const user = this.apiService.currentUser();
    const trimmedUsername = (this.userForm.username || '').trim();
    if (!trimmedUsername) {
      this.errorMsg.set('Le nom utilisateur ne peut pas être vide.');
      return;
    }
    if (!user?.id) {
      this.errorMsg.set('Impossible de mettre à jour le profil.');
      return;
    }
    this.apiService.updateUserProfile(user.id, {
      username: trimmedUsername,
      email: (this.userForm.email || '').trim(),
      role: user.role
    }).subscribe({
      next: () => {
        this.successMsg.set('Profil mis à jour avec succès.');
        this.errorMsg.set('');
        this.showUserModal.set(false);
      },
      error: () => this.errorMsg.set('Erreur lors de la sauvegarde du profil.')
    });
  }

  findIncidentForEvent(eventId: number): Incident | undefined {
    return this.incidents().find(inc => inc.evenement?.id === eventId);
  }

  openEditEvent(event: Evenement): void {
    this.selectedEvent.set(event);
    this.eventForm = { ...event };
    if (event.dateHeureDetection) {
      this.eventForm.dateHeureDetection = event.dateHeureDetection.slice(0, 16);
    }
    this.eventForm.natureEvenement = this.eventForm.natureEvenement || 'Indisponibilite';
    this.eventForm.etat = this.eventForm.etat || 'OPEN';
    this.eventForm.impactNiveau = this.eventForm.impactNiveau || (this.eventForm.impactMineur ? 'MINEUR' : 'MAJEUR');
    this.showEventForm.set(true);
  }

  saveEvent(): void {
    if (!this.isFilled(this.eventForm.libelleErreur) || !this.isFilled(this.eventForm.dateHeureDetection)) {
      this.errorMsg.set('Le titre et la date de detection sont obligatoires.');
      return;
    }
    if (!this.isFilled(this.eventForm.natureEvenement) || !this.isFilled(this.eventForm.etat)) {
      this.errorMsg.set('La nature et l etat de l evenement sont obligatoires.');
      return;
    }
    if (!this.isFilled(this.eventForm.impactNiveau)) {
      this.errorMsg.set('Le niveau d impact de l evenement est obligatoire.');
      return;
    }
    this.eventForm.impactMineur = this.eventForm.impactNiveau === 'MINEUR';

    const operation = this.selectedEvent() 
      ? this.apiService.updateEvent(this.selectedEvent()!.id!, this.eventForm)
      : this.apiService.createEvent(this.eventForm);

    operation.subscribe({
      next: () => {
        this.successMsg.set(this.selectedEvent() ? 'Événement mis à jour avec succès.' : 'Événement créé avec succès.');
        this.showEventForm.set(false);
        this.loadEvents();
        this.loadLogs();
      },
      error: () => this.errorMsg.set('Erreur de validation ou problème de connexion serveur.')
    });
  }

  deleteEvent(id: number): void {
    if (confirm('Voulez-vous vraiment supprimer cet événement ?')) {
      this.apiService.deleteEvent(id).subscribe({
        next: () => {
          this.successMsg.set('Événement supprimé.');
          this.loadEvents();
          this.loadLogs();
        },
        error: () => this.errorMsg.set('Erreur lors de la suppression.')
      });
    }
  }

  // --- Qualification Operations ---
  openQualify(event: Evenement): void {
    this.selectedEvent.set(event);
    this.eventForm = { ...event };
    
    // Default values if not set
    this.eventForm.impactConfidentialite = this.eventForm.impactConfidentialite || 'Mineur/Aucun';
    this.eventForm.impactIntegrite = this.eventForm.impactIntegrite || 'Mineur/Aucun';
    this.eventForm.impactDisponibilite = this.eventForm.impactDisponibilite || 'Mineur/Aucun';
    
    this.onQualificationChange();
    this.showQualifyForm.set(true);
  }

  onQualificationChange(): void {
    const isIncident = [
      this.eventForm.impactConfidentialite,
      this.eventForm.impactIntegrite,
      this.eventForm.impactDisponibilite
    ].some(val => val === 'Majeur' || val === 'Critique');
    
    this.qualifyValue = isIncident ? 'INCIDENT' : 'NON_INCIDENT';
  }

  // --- Risks Handling ---
  addRisque(): void {
    this.incidentForm.risques.push({ reference: '', description: '' });
  }

  removeRisque(index: number): void {
    this.incidentForm.risques.splice(index, 1);
  }

  submitQualification(): void {
    const event = this.selectedEvent();
    if (!event) return;

    const previousQualification = event.qualification;
    event.qualification = this.qualifyValue;
    event.impactConfidentialite = this.eventForm.impactConfidentialite;
    event.impactIntegrite = this.eventForm.impactIntegrite;
    event.impactDisponibilite = this.eventForm.impactDisponibilite;
    
    this.apiService.updateEvent(event.id!, event).subscribe({
      next: () => {
        this.showQualifyForm.set(false);
        
        if (this.qualifyValue === 'INCIDENT') {
          const existingIncident = this.findIncidentForEvent(event.id!);
          if (existingIncident) {
            this.openEditIncident(existingIncident);
            this.successMsg.set('Qualification mise à jour. Plan de traitement existant ouvert.');
          } else {
            // Auto-create the incident in the backend
            const newIncident = this.sanitizeIncidentPayload(this.initIncidentForm(event.id!));
            this.apiService.createIncident(newIncident).subscribe({
              next: (savedIncident) => {
                this.incidentForm = savedIncident;
                this.prepareIncidentFormDefaults();
                this.selectedIncident.set(savedIncident);
                this.showIncidentForm.set(true);
                this.successMsg.set('Événement qualifié comme incident. Complétez le plan de traitement.');
                this.loadIncidents(); // Refresh the list
              },
              error: () => this.errorMsg.set('Erreur lors de la création du plan d\'incident.')
            });
          }
        } else {
          this.successMsg.set('Événement qualifié comme non-incident.');
        }
        this.loadEvents();
        this.loadLogs();
      },
      error: () => this.errorMsg.set('Erreur lors de la qualification.')
    });
  }

  // --- Incident Operations ---
  openCreateIncident(): void {
    const event = this.events().find(item => item.id);
    if (!event?.id) {
      this.errorMsg.set('Ajoutez d abord un evenement avant de creer un incident.');
      this.switchTab('events');
      return;
    }

    this.selectedIncident.set(null);
    this.selectedEvent.set(event);
    this.incidentForm = this.initIncidentForm(event.id);
    this.prepareIncidentFormDefaults();
    this.showIncidentForm.set(true);
  }

  openEditIncident(incident: Incident): void {
    this.selectedIncident.set(incident);
    const eventId = incident.evenement?.id || 0;
    this.incidentForm = {
      ...this.initIncidentForm(eventId),
      ...incident,
      evenement: { ...(incident.evenement || {}), id: eventId }
    };
    this.prepareIncidentFormDefaults();
    this.incidentForm.mesureDDT = this.toDateInputValue(incident.mesureDDT);
    this.incidentForm.traitementDDT = this.toDateInputValue(incident.traitementDDT);
    this.incidentForm.traitementDateCloture = this.toDateInputValue(incident.traitementDateCloture);
    this.incidentForm.correctiveDateDebut = this.toDateInputValue(incident.correctiveDateDebut);
    this.incidentForm.correctiveDateCloture = this.toDateInputValue(incident.correctiveDateCloture);
    this.incidentForm.dateMesureEfficacite = this.toDateInputValue(incident.dateMesureEfficacite);
    this.incidentForm.suiviDate = this.toDateInputValue(incident.suiviDate);
    this.incidentForm.traitementHDT = this.toTimeInputValue(incident.traitementHDT);
    this.incidentForm.traitementHeureCloture = this.toTimeInputValue(incident.traitementHeureCloture);
    this.showIncidentForm.set(true);
  }

  private toDateInputValue(value?: string): string {
    if (!value) return '';
    return value.length >= 10 ? value.slice(0, 10) : value;
  }

  private toTimeInputValue(value?: string): string {
    if (!value) return '';
    return value.length >= 5 ? value.slice(0, 5) : value;
  }

  toggleIncidentType(type: string): void {
    const index = this.incidentForm.typesIncident.indexOf(type);
    if (index > -1) {
      this.incidentForm.typesIncident.splice(index, 1);
    } else {
      this.incidentForm.typesIncident.push(type);
    }
  }

  onIncidentEventChange(): void {
    this.selectedEvent.set(this.events().find(event => event.id === this.incidentForm.evenement?.id) || null);
    this.onAttenuationTimeChange();
  }

  // --- Automatic Duration Calculations ---
  onAttenuationTimeChange(): void {
    // We compute attenuation duration: time between event.dateHeureDetection and mesureDDT + heureAttenuation
    const event = this.events().find(e => e.id === this.incidentForm.evenement?.id) || this.selectedEvent();
    if (!event || !this.incidentForm.mesureDDT || !this.incidentForm.heureAttenuation) return;

    try {
      const startDt = new Date(event.dateHeureDetection);
      const endDt = new Date(`${this.incidentForm.mesureDDT}T${this.incidentForm.heureAttenuation}`);
      const diffMs = endDt.getTime() - startDt.getTime();
      
      if (!isNaN(diffMs) && diffMs >= 0) {
        const diffMins = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        
        this.incidentForm.dureeAttenuation = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
      }
    } catch (e) {
      // Keep manual value on error
    }
  }

  onTreatmentTimeChange(): void {
    // We compute treatment duration: time between traitementDDT + traitementHDT and traitementDateCloture + traitementHeureCloture
    if (!this.incidentForm.traitementDDT || !this.incidentForm.traitementHDT || 
        !this.incidentForm.traitementDateCloture || !this.incidentForm.traitementHeureCloture) return;

    try {
      const startDt = new Date(`${this.incidentForm.traitementDDT}T${this.incidentForm.traitementHDT}`);
      const endDt = new Date(`${this.incidentForm.traitementDateCloture}T${this.incidentForm.traitementHeureCloture}`);
      const diffMs = endDt.getTime() - startDt.getTime();
      
      if (!isNaN(diffMs) && diffMs >= 0) {
        const diffMins = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        
        this.incidentForm.dureeTraitement = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
      }
    } catch (e) {
      // Keep manual value
    }
  }

  saveIncident(): void {
    if (!this.incidentForm.evenement?.id) {
      this.errorMsg.set('Selectionnez l evenement rattache a l incident.');
      return;
    }

    // If we're closing, ensure traitementEtat matches
    if (this.incidentForm.traitementDateCloture && this.incidentForm.traitementHeureCloture) {
      this.incidentForm.traitementEtat = 'Clôturé';
    }

    // Sanitize dates to prevent backend parse errors when strings are empty
    const payload = this.sanitizeIncidentPayload(this.incidentForm);

    const operation = this.selectedIncident()
      ? this.apiService.updateIncident(this.selectedIncident()!.id!, payload)
      : this.apiService.createIncident(payload);

    operation.subscribe({
      next: () => {
        this.successMsg.set(this.selectedIncident() ? 'Plan de traitement mis à jour.' : 'Incident qualifié et plan créé.');
        this.showIncidentForm.set(false);
        this.loadIncidents();
        this.loadEvents();
        this.loadLogs();
      },
      error: () => this.errorMsg.set('Erreur lors de la sauvegarde de l\'incident.')
    });
  }

  deleteIncident(id: number): void {
    if (confirm('Voulez-vous vraiment supprimer cet incident ?')) {
      this.apiService.deleteIncident(id).subscribe({
        next: () => {
          this.successMsg.set('Incident supprimé.');
          this.loadIncidents();
          this.loadLogs();
        },
        error: () => this.errorMsg.set('Erreur lors de la suppression de l\'incident.')
      });
    }
  }

  logout(): void {
    this.apiService.logout();
  }

  // --- AI Smart Fill (Simulation) ---
  magicFill(): void {
    const title = (this.eventForm.libelleErreur || '').toLowerCase();
    if (!title) {
      this.errorMsg.set('Veuillez dicter ou écrire un titre d\'abord.');
      return;
    }

    // Simulate AI generation based on keywords
    if (title.includes('panne') || title.includes('serveur')) {
      this.eventForm.descriptionDetaillee = this.eventForm.descriptionDetaillee || "Le serveur principal a cessé de répondre aux requêtes, entraînant une indisponibilité temporaire des services.";
      this.eventForm.causesPossibles = this.eventForm.causesPossibles || "Coupure réseau, défaillance matérielle ou surcharge système.";
      this.eventForm.commentaireConfidentialite = this.eventForm.commentaireConfidentialite || "Aucune donnée n'a été exfiltrée, impact nul sur la confidentialité.";
      this.eventForm.commentaireDisponibilite = this.eventForm.commentaireDisponibilite || "Les services sont totalement inaccessibles pour tous les utilisateurs métiers.";
      this.eventForm.commentaireIntegrite = this.eventForm.commentaireIntegrite || "Les données existantes n'ont pas été altérées.";
      this.eventForm.natureEvenement = "Indisponibilite";
      this.eventForm.detecteParSource = "Supervision";
      this.eventForm.impactNiveau = "MAJEUR";
      
      if (this.incidentForm && this.showIncidentForm()) {
        this.incidentForm.preconisation = this.incidentForm.preconisation || "Mettre en place une redondance serveur (cluster HA) et un onduleur de secours.";
        this.incidentForm.actionCorrective = this.incidentForm.actionCorrective || "Remplacement de l'alimentation défectueuse et restauration depuis la dernière sauvegarde.";
        this.incidentForm.impactContinuiteDescription = this.incidentForm.impactContinuiteDescription || "Interruption du service d'expédition pendant 2 heures.";
      }
    } else if (title.includes('feu') || title.includes('incendie') || title.includes('physique')) {
      this.eventForm.descriptionDetaillee = this.eventForm.descriptionDetaillee || "Une alarme incendie a été déclenchée dans le datacenter. L'accès physique a été temporairement restreint.";
      this.eventForm.causesPossibles = this.eventForm.causesPossibles || "Surchauffe d'équipement ou alarme défectueuse.";
      this.eventForm.commentaireConfidentialite = this.eventForm.commentaireConfidentialite || "Les serveurs physiques sont sécurisés, pas de fuite.";
      this.eventForm.commentaireDisponibilite = this.eventForm.commentaireDisponibilite || "Coupure préventive de l'alimentation électrique du datacenter local.";
      this.eventForm.commentaireIntegrite = this.eventForm.commentaireIntegrite || "L'intégrité des disques doit être vérifiée après le redémarrage.";
      this.eventForm.natureEvenement = "Degat_physique";
      this.eventForm.detecteParSource = "Utilisateur";
      this.eventForm.impactNiveau = "CRITIQUE";
      
      if (this.incidentForm && this.showIncidentForm()) {
        this.incidentForm.preconisation = this.incidentForm.preconisation || "Révision complète du système d'extinction d'incendie et des capteurs thermiques.";
        this.incidentForm.actionCorrective = this.incidentForm.actionCorrective || "Intervention des pompiers, nettoyage de la zone et remplacement des câbles fondus.";
        this.incidentForm.impactContinuiteDescription = this.incidentForm.impactContinuiteDescription || "Déclenchement du Plan de Continuité d'Activité (PCA) sur le site de secours.";
      }
    } else if (title.includes('mot de passe') || title.includes('accès')) {
      this.eventForm.descriptionDetaillee = this.eventForm.descriptionDetaillee || "Tentatives répétées d'accès non autorisé détectées sur le portail d'authentification.";
      this.eventForm.causesPossibles = this.eventForm.causesPossibles || "Attaque par force brute ou erreur de frappe d'un utilisateur légitime.";
      this.eventForm.commentaireConfidentialite = this.eventForm.commentaireConfidentialite || "Risque potentiel si l'attaquant a réussi à deviner un mot de passe faible.";
      this.eventForm.commentaireDisponibilite = this.eventForm.commentaireDisponibilite || "Le compte utilisateur a été temporairement verrouillé (disponibilité réduite pour cet utilisateur).";
      this.eventForm.commentaireIntegrite = this.eventForm.commentaireIntegrite || "Aucune modification de données détectée.";
      this.eventForm.natureEvenement = "Acces_illicite";
      this.eventForm.detecteParSource = "Supervision";
      this.eventForm.impactNiveau = "MINEUR";
      
      if (this.incidentForm && this.showIncidentForm()) {
        this.incidentForm.preconisation = this.incidentForm.preconisation || "Forcer l'authentification multifacteur (MFA) pour tous les comptes externes.";
        this.incidentForm.actionCorrective = this.incidentForm.actionCorrective || "Blocage de l'adresse IP source et réinitialisation du mot de passe compromis.";
        this.incidentForm.impactContinuiteDescription = this.incidentForm.impactContinuiteDescription || "Aucun impact majeur sur la continuité de l'entreprise.";
      }
    } else {
      this.eventForm.descriptionDetaillee = this.eventForm.descriptionDetaillee || "L'événement s'est produit soudainement. L'analyse est en cours pour déterminer les détails exacts.";
      this.eventForm.causesPossibles = this.eventForm.causesPossibles || "Instabilité du système ou erreur de configuration récente.";
      this.eventForm.commentaireConfidentialite = this.eventForm.commentaireConfidentialite || "En cours d'évaluation.";
      this.eventForm.commentaireDisponibilite = this.eventForm.commentaireDisponibilite || "En cours d'évaluation.";
      this.eventForm.commentaireIntegrite = this.eventForm.commentaireIntegrite || "En cours d'évaluation.";
      this.eventForm.natureEvenement = "Autre";
      this.eventForm.detecteParSource = "Helpdesk";
      
      if (this.incidentForm && this.showIncidentForm()) {
        this.incidentForm.preconisation = this.incidentForm.preconisation || "Renforcer la supervision sur ce périmètre applicatif.";
        this.incidentForm.actionCorrective = this.incidentForm.actionCorrective || "Application des correctifs de base et redémarrage des services.";
      }
    }

    // Extract time smartly if keywords like "hier à 15h", "aujourd'hui à 10h" are found
    const now = new Date();
    if (title.includes('hier')) {
      now.setDate(now.getDate() - 1);
    }
    const hourMatch = title.match(/(\d{1,2})h/);
    if (hourMatch) {
      now.setHours(parseInt(hourMatch[1], 10), 0, 0, 0);
    }
    
    // Convert to native datetime-local format: YYYY-MM-DDThh:mm
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    this.eventForm.dateHeureDetection = `${year}-${month}-${day}T${hours}:${mins}`;

    this.successMsg.set('✨ Remplissage magique terminé avec succès !');
  }

  // --- Speech to Text ---
  isDictating: { [field: string]: boolean } = {};

  startDictation(formContext: 'event' | 'incident', field: string): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.errorMsg.set("Votre navigateur ne supporte pas la reconnaissance vocale.");
      return;
    }

    if (this.isDictating[field]) {
      this.isDictating[field] = false;
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    this.isDictating[field] = true;

    recognition.onresult = (event: any) => {
      const speechResult = event.results[0][0].transcript;
      const targetForm = formContext === 'event' ? this.eventForm : this.incidentForm;
      
      const currentVal = (targetForm as any)[field] || '';
      (targetForm as any)[field] = currentVal ? `${currentVal} ${speechResult}` : speechResult;
      
      this.isDictating[field] = false;
    };
    
    recognition.onerror = () => {
      this.isDictating[field] = false;
    };

    recognition.onend = () => {
      this.isDictating[field] = false;
    };

    recognition.start();
  }


}
