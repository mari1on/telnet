import { Component, OnInit, OnDestroy, signal, computed, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, User } from '../api.service';

interface Evenement {
  id?: number;
  referenceEvenement?: string;
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
  envoyeAuRssi?: boolean;
  dateEnvoiRssi?: string;
}

interface Risque {
  id?: number;
 reference?: string;
description?: string;
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
  mesureDateCloture: string;
  mesureHeureCloture: string;
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
  evenementsSimilaires: string;
  evenementsDetailsDescription: string;
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


interface AssistantMatch {
  eventId: number;
  title: string;
  date?: string;
  score: number;
  qualification?: string;
  reason?: string;
}

interface AssistantIncidentDraft {
  typesIncident?: string[];
  niveauImpact?: string;
  dureeIndisponibilite?: string;
  mesureAction?: string;
  mesureEtat?: string;
  traitementAction?: string;
  traitementEtat?: string;
  preconisation?: string;
  actionCorrective?: string;
  impactContinuite?: boolean;
  impactContinuiteDescription?: string;
  changementDeclenche?: boolean;
  changementDeclencheDescription?: string;
  risques?: Risque[];
}


interface AssistantEventDraft {
  libelleErreur?: string;
  descriptionDetaillee?: string;
  detecteParSource?: string;
  idTicket?: string;
  commentaireSource?: string;
  natureEvenement?: string;
  serviceOsAppli?: string;
  equipementHardware?: string;
  codeErreur?: string;
  causesPossibles?: string;
  etat?: string;
  appreciation?: string;
  evaluation?: string;
  impactNiveau?: string;
  impactMineur?: boolean;
  impactCommentaire?: string;
  typeActif?: string;
  actifAffecte?: string;
}

interface AssistantQualificationDraft {
  impactConfidentialite: 'Mineur' | 'Majeur' | 'Critique';
  impactIntegrite: 'Mineur' | 'Majeur' | 'Critique';
  impactDisponibilite: 'Mineur' | 'Majeur' | 'Critique';
  commentaireConfidentialite?: string;
  commentaireIntegrite?: string;
  commentaireDisponibilite?: string;
  qualification?: 'INCIDENT' | 'NON_INCIDENT';
}

interface AssistantResponse {
  answer: string;
  confirmationPrompt: string;
  askToFillIncident?: boolean;
  askToCreateEvent?: boolean;
  selectedEventId?: number | null;
  eventDraft?: AssistantEventDraft;
  incidentDraft?: AssistantIncidentDraft;
  qualificationDraft?: AssistantQualificationDraft;
  similarFound: boolean;
  matches: AssistantMatch[];
  actions: string[];
  source: string;
  engine?: string;
  diagnostic?: string;
}

interface ChatMessage {
  role: 'assistant' | 'user';
  text: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit, OnDestroy {
  activeTab = signal<'stats' | 'events' | 'incidents' | 'logs' | 'assistant' | 'settings'>('stats');
  darkMode = signal(true);
  sidebarOpen = signal(false);

  // Recherche et filtres des listes
  eventSearch = '';
  eventStateFilter = 'ALL';
  eventQualificationFilter = 'ALL';
  eventRssiFilter = 'ALL';
  incidentSearch = '';
  incidentStateFilter = 'ALL';
  logSearch = '';
  selectedExistingRiskReference = '';
  activeVoiceSearch = signal<string | null>(null);
  assistantAutoSpeak = signal(true);
  unreadRssiEvents = signal<Evenement[]>([]);
  notificationCount = computed(() => this.unreadRssiEvents().length);

  // Assistant RSSI local (moteur Python, sans service d'IA externe)
  assistantSelectedEventId: number | null = null;
  assistantInferredEventId: number | null = null;
  aiGeneratingField = signal<string | null>(null);
  assistantAutofillActive = signal(false);
  assistantEventAutofillActive = signal(false);
  assistantPendingNewEventResult = signal<AssistantResponse | null>(null);
  assistantQuestion = '';
  assistantLoading = signal(false);
  assistantResult = signal<AssistantResponse | null>(null);
  private eventPollTimer: number | null = null;
  private eventsInitialized = false;
  private readonly lastScannedEventKey = 'telnet_rssi_last_scanned_event_id';
  private readonly unreadEventIdsKey = 'telnet_rssi_unread_event_ids';
  private readonly dismissedNotificationEventKey = 'telnet_rssi_dismissed_notification_event_id';

  assistantMessages = signal<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'Bonjour. Posez votre question sur les événements, les incidents, les risques ou le fonctionnement de TELNET.'
    }
  ]);

  // Lists
  events = signal<Evenement[]>([]);
  incidents = signal<Incident[]>([]);
  risks = signal<Risque[]>([]);
  logs = signal<any[]>([]);

  isSubmitting = signal<boolean>(false);
  isSendingToRssi = signal<boolean>(false);

  // Selected Items for Forms/Modals
  selectedEvent = signal<Evenement | null>(null);
  selectedIncident = signal<Incident | null>(null);

  // Forms Visibility
  showEventForm = signal(false);
  showIncidentForm = signal(false);
  showQualifyForm = signal(false);
  showUserModal = signal(false);

  // Messages globaux hors formulaires
  successMsg = signal('');
  errorMsg = signal('');

  // Messages locaux : ils restent visibles dans le formulaire concerné.
  eventFormError = signal('');
  eventFormSuccess = signal('');
  qualificationFormError = signal('');
  qualificationFormSuccess = signal('');
  incidentFormError = signal('');
  incidentFormSuccess = signal('');
  incidentInvalidRiskIndex = signal<number | null>(null);

  // Notification persistante du RSSI, fermée uniquement par l'utilisateur.
  notificationToastVisible = signal(false);
  notificationToastEvent = signal<Evenement | null>(null);

  // Curseur visuel de l'assistant pendant le remplissage automatique.
  assistantCursorVisible = signal(false);
  assistantCursorPosition = signal({ x: 24, y: 24 });

  // Dropdown list options
  sources = ['HELP_DESK', 'SIEM', 'UTILISATEUR', 'SUPERVISION', 'AUTRE'];
  eventNatures = ['Indisponibilite', 'Degradation', 'Erreur applicative', 'Alerte securite', 'Suspicion de fraude', 'Autre'];
  etatsEvent = ['Ouvert', 'En cours', 'Clos'];
  eventImpactLevels = ['Aucun', 'Mineur', 'Majeur', 'Critique'];
  impactOptions = ['Mineur', 'Majeur', 'Critique'];
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
    role: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };

  constructor(protected apiService: ApiService, private cdr: ChangeDetectorRef, private router: Router, private ngZone: NgZone) {}

  ngOnInit(): void {
    const savedTheme = localStorage.getItem('telnet_rssi_theme');
    this.darkMode.set(savedTheme !== 'light');
    this.activeTab.set(this.apiService.isRssi() ? 'stats' : 'events');
    this.loadEvents();
    this.loadIncidents();
    this.loadRisks();
    this.loadLogs();
    if (this.apiService.isRssi()) {
      this.eventPollTimer = window.setInterval(() => this.loadEvents(true), 20000);
    }
  }

  ngOnDestroy(): void {
    if (this.eventPollTimer !== null) window.clearInterval(this.eventPollTimer);
    if (this.activeRecognition) this.activeRecognition.stop();
  }

  // --- Initializers ---
  private generateEventReference(): string {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0');
    return `EV-${date}-${suffix}`;
  }

  initEventForm(): Evenement {
    return {
      referenceEvenement: this.generateEventReference(),
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
      impactNiveau: 'Aucun',
      impactMineur: false,
      impactCommentaire: '',
      typeActif: '',
      actifAffecte: '',
      qualification: 'NON_QUALIFIE',
      impactConfidentialite: '',
      commentaireConfidentialite: '',
      impactIntegrite: '',
      commentaireIntegrite: '',
      impactDisponibilite: '',
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
      mesureDateCloture: '',
      mesureHeureCloture: '',
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
      evenementsSimilaires: 'Non',
      evenementsDetailsDescription: '',
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

  toggleTheme(): void {
    this.setTheme(this.darkMode() ? 'light' : 'dark');
  }

  setTheme(theme: 'dark' | 'light'): void {
    this.darkMode.set(theme === 'dark');
    localStorage.setItem('telnet_rssi_theme', theme);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(value => !value);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  getEventBarHeight(count: number): number {
    const max = Math.max(...this.getEventsByYear().map(item => item.count), 0);
    return max === 0 ? 0 : Math.max(10, Math.round((count / max) * 100));
  }

  getNatureBarWidth(count: number): number {
    const max = Math.max(...this.getEventsByNature().map(item => item.count), 0);
    return max === 0 ? 0 : Math.max(8, Math.round((count / max) * 100));
  }

  getIncidentDonutGradient(): string {
    const states = this.getIncidentsByEtat();
    const total = states.reduce((sum, item) => sum + item.count, 0);
    if (total === 0) {
      return 'conic-gradient(#3a4351 0 100%)';
    }

    const open = ((states.find(item => item.etat === 'Ouvert')?.count || 0) / total) * 100;
    const inProgress = ((states.find(item => item.etat === 'En cours')?.count || 0) / total) * 100;
    const secondStop = open + inProgress;

    return `conic-gradient(
      #7898cc 0 ${open}%,
      #57709a ${open}% ${secondStop}%,
      #394453 ${secondStop}% 100%
    )`;
  }

  // --- Actions ---
  switchTab(tab: 'events' | 'incidents' | 'logs' | 'stats' | 'assistant' | 'settings'): void {
    this.activeTab.set(tab as any);
    this.successMsg.set('');
    this.errorMsg.set('');
    if (tab === 'events') this.loadEvents();
    if (tab === 'incidents') { this.loadIncidents(); this.loadRisks(); }
    if (tab === 'logs') this.loadLogs();
    if (tab === 'assistant') this.prepareAssistantSelection();
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
    return this.events().filter(e => e.qualification && e.qualification !== 'NON_QUALIFIE').length;
  }

  getEvenementsClassesPercent(): number {
    const total = this.events().length;
    return total === 0 ? 0 : Math.round((this.getEvenementsClasses() / total) * 100);
  }

  getIncidentsImpactCritiqueConfidentialite(): number {
    return this.incidents().filter(incident =>
      this.getIncidentEvent(incident)?.impactConfidentialite === 'Critique'
    ).length;
  }

  getIncidentsImpactCritiqueDisponibilite(): number {
    return this.incidents().filter(incident =>
      this.getIncidentEvent(incident)?.impactDisponibilite === 'Critique'
    ).length;
  }

  getIncidentsImpactCritiqueIntegrite(): number {
    return this.incidents().filter(incident =>
      this.getIncidentEvent(incident)?.impactIntegrite === 'Critique'
    ).length;
  }

  getCriticalImpactStats(): Array<{ label: string; count: number; key: string }> {
    return [
      { label: 'Confidentialité', count: this.getIncidentsImpactCritiqueConfidentialite(), key: 'confidentialite' },
      { label: 'Disponibilité', count: this.getIncidentsImpactCritiqueDisponibilite(), key: 'disponibilite' },
      { label: 'Intégrité', count: this.getIncidentsImpactCritiqueIntegrite(), key: 'integrite' }
    ];
  }

  getCriticalImpactBarWidth(count: number): number {
    const max = Math.max(...this.getCriticalImpactStats().map(item => item.count), 1);
    return count === 0 ? 0 : Math.max(12, Math.round((count / max) * 100));
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

  getExistingRiskCatalog(): Risque[] {
    const byReference = new Map<string, Risque>();
    const candidates = [
      ...this.risks(),
      ...this.incidents().flatMap(incident => incident.risques || [])
    ];

    for (const risk of candidates) {
      const reference = (risk.reference || '').trim();
      if (!reference) continue;
      const key = this.normalizeSearch(reference);
      if (!byReference.has(key)) {
        byReference.set(key, {
          id: risk.id,
          reference,
          description: (risk.description || '').trim()
        });
      }
    }

    return [...byReference.values()].sort((a, b) =>
      (a.reference || '').localeCompare(b.reference || '', 'fr', { numeric: true })
    );
  }

  getRiskOptionLabel(risk: Risque): string {
    const description = (risk.description || 'Sans description').trim();
    const shortDescription = description.length > 72 ? `${description.slice(0, 72)}…` : description;
    return `${risk.reference || 'Sans référence'} — ${shortDescription}`;
  }

  getSelectedExistingRisk(): Risque | null {
    return this.getExistingRiskCatalog().find(
      risk => risk.reference === this.selectedExistingRiskReference
    ) || null;
  }


  addExistingRiskFromCatalog(): void {
    const selected = this.getExistingRiskCatalog().find(
      risk => risk.reference === this.selectedExistingRiskReference
    );
    if (!selected) {
      this.incidentFormError.set('Sélectionnez un risque existant dans la liste.');
      return;
    }
    const alreadyAdded = this.incidentForm.risques.some(
      risk => this.normalizeSearch(risk.reference) === this.normalizeSearch(selected.reference)
    );
    if (alreadyAdded) {
      this.incidentFormError.set('Ce risque est déjà associé à ce plan d’incident.');
      return;
    }
    this.incidentForm.risques.push({
      reference: selected.reference,
      description: selected.description
    });
    this.selectedExistingRiskReference = '';
    this.incidentFormError.set('');
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


  getFilteredEvents(): Evenement[] {
    const search = this.normalizeSearch(this.eventSearch);
    return this.events().filter(event => {
      const searchable = this.normalizeSearch([
        event.referenceEvenement,
        event.id,
        event.libelleErreur,
        event.descriptionDetaillee,
        event.detecteParSource,
        event.declarePar,
        event.etat,
        event.qualification,
        event.natureEvenement,
        event.idTicket,
        event.codeErreur,
        event.serviceOsAppli
      ].filter(Boolean).join(' '));

      const matchesSearch = this.matchesNormalizedSearch(searchable, search);
      const matchesState = this.eventStateFilter === 'ALL' || event.etat === this.eventStateFilter;
      const matchesQualification = this.eventQualificationFilter === 'ALL'
        || event.qualification === this.eventQualificationFilter;
      const matchesRssi = this.eventRssiFilter === 'ALL'
        || (this.eventRssiFilter === 'SENT' && event.envoyeAuRssi === true)
        || (this.eventRssiFilter === 'NOT_SENT' && event.envoyeAuRssi !== true);

      return matchesSearch && matchesState && matchesQualification && matchesRssi;
    });
  }

  getFilteredIncidents(): Incident[] {
    const search = this.normalizeSearch(this.incidentSearch);
    return this.incidents().filter(incident => {
      const event = this.getIncidentEvent(incident);
      const searchable = this.normalizeSearch([
        incident.id,
        event?.id,
        event?.libelleErreur,
        event?.descriptionDetaillee,
        event?.natureEvenement,
        incident.traitementEtat,
        incident.traitementResponsable,
        incident.niveauImpact,
        incident.dureeIndisponibilite,
        incident.dureeTraitement
      ].filter(value => value !== undefined && value !== null).join(' '));

      const matchesSearch = this.matchesNormalizedSearch(searchable, search);
      const matchesState = this.incidentStateFilter === 'ALL'
        || incident.traitementEtat === this.incidentStateFilter;
      return matchesSearch && matchesState;
    });
  }

  getIncidentDowntimeDisplay(incident: Incident): string {
    if (this.isFilled(incident.dureeIndisponibilite)) {
      return incident.dureeIndisponibilite;
    }
    const event = this.getIncidentEvent(incident);
    if (!event?.dateHeureDetection) return 'Non calculable';

    const start = new Date(event.dateHeureDetection);
    if (Number.isNaN(start.getTime())) return 'Non calculable';

    const closures = [
      incident.mesureDateCloture && incident.mesureHeureCloture
        ? new Date(`${incident.mesureDateCloture}T${incident.mesureHeureCloture}`)
        : null,
      incident.traitementDateCloture && incident.traitementHeureCloture
        ? new Date(`${incident.traitementDateCloture}T${incident.traitementHeureCloture}`)
        : null
    ].filter((value): value is Date => value !== null && !Number.isNaN(value.getTime()));

    const end = closures.length > 0
      ? closures.reduce((earliest, value) => value.getTime() < earliest.getTime() ? value : earliest)
      : new Date();
    return this.formatDurationBetween(start, end) + (closures.length === 0 ? ' (en cours)' : '');
  }

  getFilteredLogs(): any[] {
    const search = this.normalizeSearch(this.logSearch);
    if (!search) return this.logs();
    return this.logs().filter(log => {
      const timestamp = log.timestamp ? new Date(log.timestamp) : null;
      const dateText = timestamp && !Number.isNaN(timestamp.getTime())
        ? `${timestamp.toLocaleDateString('fr-FR')} ${timestamp.toLocaleTimeString('fr-FR')}`
        : '';
      const searchable = this.normalizeSearch([
        log.username,
        log.action,
        log.timestamp,
        dateText
      ].filter(Boolean).join(' '));
      return this.matchesNormalizedSearch(searchable, search);
    });
  }

  resetEventFilters(): void {
    this.eventSearch = '';
    this.eventStateFilter = 'ALL';
    this.eventQualificationFilter = 'ALL';
    this.eventRssiFilter = 'ALL';
  }

  resetIncidentFilters(): void {
    this.incidentSearch = '';
    this.incidentStateFilter = 'ALL';
  }

  resetLogFilters(): void {
    this.logSearch = '';
  }

  private matchesNormalizedSearch(searchable: string, normalizedQuery: string): boolean {
    if (!normalizedQuery) return true;
    const haystack = searchable.split(/\s+/).filter(Boolean);
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return terms.every(term => haystack.some(candidate =>
      candidate.includes(term)
      || term.includes(candidate)
      || (term.length >= 4 && candidate.length >= 4 && this.levenshteinDistance(candidate, term) <= 2)
    ));
  }

  private levenshteinDistance(left: string, right: string): number {
    const matrix = Array.from({ length: right.length + 1 }, (_, row) => [row]);
    for (let column = 0; column <= left.length; column++) matrix[0][column] = column;
    for (let row = 1; row <= right.length; row++) {
      for (let column = 1; column <= left.length; column++) {
        matrix[row][column] = right[row - 1] === left[column - 1]
          ? matrix[row - 1][column - 1]
          : Math.min(matrix[row - 1][column - 1], matrix[row][column - 1], matrix[row - 1][column]) + 1;
      }
    }
    return matrix[right.length][left.length];
  }

  private normalizeSearch(value: unknown): string {
    const synonyms: Record<string, string> = {
      authentication: 'auth', authentification: 'auth', login: 'auth', connexion: 'auth', access: 'auth', acces: 'auth',
      failure: 'echec', failed: 'echec', erreur: 'echec', error: 'echec',
      network: 'reseau', connectivity: 'reseau', connectivite: 'reseau', vpn: 'reseau',
      outage: 'indisponibilite', downtime: 'indisponibilite', down: 'indisponibilite', panne: 'indisponibilite', coupure: 'indisponibilite',
      server: 'serveur', host: 'serveur',
      event: 'evenement', events: 'evenement', evenements: 'evenement', declaration: 'evenement', declarations: 'evenement',
      incident: 'incident', incidents: 'incident',
      risk: 'risque', risks: 'risque', risques: 'risque', threat: 'menace',
      open: 'ouvert', opened: 'ouvert', closed: 'clos', pending: 'attente',
      major: 'majeur', minor: 'mineur', critical: 'critique',
      integrity: 'integrite', availability: 'disponibilite', confidentiality: 'confidentialite',
      sent: 'envoye', user: 'utilisateur', helpdesk: 'helpdesk'
    };

    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(token => synonyms[token] || token)
      .join(' ');
  }

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

  validateEventFormComplete(event: Evenement): string | null {
    if (!this.isFilled(event.libelleErreur)) return 'Le libellé d\'erreur (titre) est obligatoire.';
    if (!this.isFilled(event.descriptionDetaillee)) return 'La description détaillée est obligatoire.';
    if (!this.isFilled(event.dateHeureDetection)) return 'La date et l\'heure de détection sont obligatoires.';
    if (!this.isFilled(event.detecteParSource)) return 'La source de détection est obligatoire.';
    if (!this.isFilled(event.idTicket)) return "L'ID Ticket est obligatoire.";
    if (!this.isFilled(event.codeErreur)) return 'Le code erreur est obligatoire.';
    if (!this.isFilled(event.causesPossibles)) return 'Les causes possibles sont obligatoires.';
    if (!this.isFilled(event.etat)) return 'L\'état de l\'événement est obligatoire.';
    if (!this.isFilled(event.natureEvenement)) return 'La nature de l\'événement est obligatoire.';
    return null;
  }

  isEventFormComplete(event: Evenement = this.eventForm): boolean {
    return this.validateEventFormComplete(event) === null;
  }

  canSendEventToRssi(event?: Evenement | null): boolean {
    const target = event ?? this.eventForm;
    return !target.envoyeAuRssi && this.isEventFormComplete(target);
  }

  private sanitizeIncidentPayload(incident: Incident): Incident {
    const payload: Incident = {
      ...incident,
      typesIncident: (Array.isArray(incident.typesIncident) ? incident.typesIncident : [incident.typesIncident as any])
        .map(value => String(value || '').trim())
        .filter(Boolean),
      risques: (Array.isArray(incident.risques) ? incident.risques : [])
        .map(risk => ({
          ...(risk.id ? { id: risk.id } : {}),
          reference: (risk.reference || '').trim(),
          description: (risk.description || '').trim()
        }))
        .filter(risk => Boolean(risk.description)),
      evenement: { id: Number(incident.evenement?.id || 0) },
      hasRisquesAssocies: Boolean(incident.hasRisquesAssocies),
      impactContinuite: Boolean(incident.impactContinuite),
      capitalisation: Boolean(incident.capitalisation),
      changementDeclenche: Boolean(incident.changementDeclenche),
      miseAJourPcaNecessaire: Boolean(incident.miseAJourPcaNecessaire),
      risquesAMettreAJour: Boolean(incident.risquesAMettreAJour)
    };
    const dateFields: (keyof Incident)[] = [
      'mesureDDT', 'mesureDateCloture', 'mesureHeureCloture', 'traitementDDT', 'traitementDateCloture',
      'correctiveDateDebut', 'correctiveDateCloture', 'dateMesureEfficacite', 'suiviDate',
      'heureAttenuation', 'traitementHDT', 'traitementHeureCloture', 'heureTraitement'
    ];
    dateFields.forEach(field => {
      if (payload[field] === '') (payload as any)[field] = null;
    });
    return payload;
  }

  private extractApiErrorMessage(err: any, fallback: string): string {
    const body = err?.error;
    if (typeof body === 'string' && body.trim()) return body.trim();
    return body?.message || body?.detail || body?.error || err?.message || fallback;
  }

  private prepareIncidentFormDefaults(): void {
    this.incidentForm = {
      ...this.initIncidentForm(this.incidentForm.evenement?.id || 0),
      ...this.incidentForm,
      evenement: { ...(this.incidentForm.evenement || {}), id: this.incidentForm.evenement?.id || 0 }
    };

    this.incidentForm.typesIncident = this.incidentForm.typesIncident || [];
    this.incidentForm.impactContinuite = this.incidentForm.impactContinuite ?? false;
    this.incidentForm.changementDeclenche = this.incidentForm.changementDeclenche ?? false;
    this.incidentForm.miseAJourPcaNecessaire = this.incidentForm.miseAJourPcaNecessaire ?? false;
    this.incidentForm.risquesAMettreAJour = this.incidentForm.risquesAMettreAJour ?? false;
    this.incidentForm.evenementsSimilaires = (this.incidentForm.evenementsSimilaires && typeof this.incidentForm.evenementsSimilaires === 'string') 
      ? this.incidentForm.evenementsSimilaires 
      : 'Non';
    this.incidentForm.suiviAuteur = this.incidentForm.suiviAuteur || this.apiService.currentUser()?.username || '';
    this.incidentForm.suiviDate = this.toDateInputValue(this.incidentForm.suiviDate) || new Date().toISOString().slice(0, 10);

    // La durée est immédiatement visible, même pour un incident encore ouvert.
    this.onUnavailabilityTimeChange();
  }

  loadEvents(silent = false): void {
    this.apiService.getEvents().subscribe({
      next: (data) => {
        this.events.set(data);
        if (this.apiService.isRssi()) this.processRssiNotifications(data || []);
      },
      error: () => {
        if (!silent) this.errorMsg.set('Erreur lors du chargement des événements.');
      }
    });
  }

  private processRssiNotifications(data: Evenement[]): void {
    const withIds = data.filter(event => Number.isFinite(Number(event.id)));
    const maxId = Math.max(0, ...withIds.map(event => Number(event.id || 0)));
    const storedScan = Number(localStorage.getItem(this.lastScannedEventKey) || 0);
    let unreadIds: number[] = [];
    try {
      unreadIds = JSON.parse(localStorage.getItem(this.unreadEventIdsKey) || '[]')
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isFinite(value));
    } catch {
      unreadIds = [];
    }

    if (!this.eventsInitialized && storedScan === 0) {
      localStorage.setItem(this.lastScannedEventKey, String(maxId));
      this.unreadRssiEvents.set([]);
      this.eventsInitialized = true;
      return;
    }

    const newEvents = withIds.filter(event =>
      Number(event.id) > storedScan
      && event.envoyeAuRssi === true
      && event.qualification === 'NON_QUALIFIE'
    );
    const mergedIds = Array.from(new Set([...unreadIds, ...newEvents.map(event => Number(event.id))]));
    const unread = withIds
      .filter(event => mergedIds.includes(Number(event.id)))
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
    this.unreadRssiEvents.set(unread);
    localStorage.setItem(this.unreadEventIdsKey, JSON.stringify(mergedIds));
    if (maxId > storedScan) localStorage.setItem(this.lastScannedEventKey, String(maxId));
    this.eventsInitialized = true;

    const newestUnread = unread[0] || null;
    const dismissedId = Number(localStorage.getItem(this.dismissedNotificationEventKey) || 0);
    if (newestUnread && Number(newestUnread.id || 0) !== dismissedId) {
      this.notificationToastEvent.set(newestUnread);
      this.notificationToastVisible.set(true);
    }

    if (newEvents.length > 0) {
      const newest = [...newEvents].sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0];
      localStorage.removeItem(this.dismissedNotificationEventKey);
      this.notificationToastEvent.set(newest);
      this.notificationToastVisible.set(true);
      this.announceNewRssiEvent(newest, newEvents.length);
    }
  }

  private announceNewRssiEvent(event: Evenement, count: number): void {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const title = event.libelleErreur || event.referenceEvenement || `événement ${event.id}`;
    const utterance = new SpeechSynthesisUtterance(
      count > 1 ? `${count} nouveaux événements de sécurité ont été reçus.` : `Nouvel événement de sécurité reçu : ${title}.`
    );
    utterance.lang = 'fr-FR';
    utterance.rate = 0.94;
    window.speechSynthesis.speak(utterance);
  }

  openNotifications(): void {
    const currentToastId = Number(this.notificationToastEvent()?.id || 0);
    if (currentToastId > 0) localStorage.setItem(this.dismissedNotificationEventKey, String(currentToastId));
    this.switchTab('events');
    this.unreadRssiEvents.set([]);
    this.notificationToastVisible.set(false);
    localStorage.setItem(this.unreadEventIdsKey, '[]');
  }

  closeNotificationToast(): void {
    const currentToastId = Number(this.notificationToastEvent()?.id || 0);
    if (currentToastId > 0) localStorage.setItem(this.dismissedNotificationEventKey, String(currentToastId));
    this.notificationToastVisible.set(false);
  }

  loadIncidents(): void {
    this.apiService.getIncidents().subscribe({
      next: (data) => this.incidents.set(data),
      error: () => this.errorMsg.set('Erreur lors du chargement des incidents.')
    });
  }

  loadRisks(): void {
    this.apiService.getRisks().subscribe({
      next: (data) => this.risks.set(data || []),
      error: () => { /* Le catalogue peut rester dérivé des incidents. */ }
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
    this.eventFormError.set('');
    this.eventFormSuccess.set('');
    this.eventForm = this.initEventForm();
    this.eventForm.declarePar = this.apiService.currentUser()?.username || '';
    this.selectedEvent.set(null);
    this.showEventForm.set(true);
  }

  openUserModal(): void {
    this.openSettings();
  }


  openAssistant(): void {
    this.activeTab.set('assistant');
    this.successMsg.set('');
    this.errorMsg.set('');
    this.prepareAssistantSelection();
    this.closeSidebar();
  }

  private prepareAssistantSelection(): void {
    // L'événement est déduit automatiquement depuis la question et la conversation.
  }

  sendAssistantMessage(): void {
    const question = this.assistantQuestion.trim();
    if (!question) {
      this.assistantMessages.update(messages => [...messages, { role: 'assistant', text: 'Écrivez ou dictez une question avant de l’envoyer.' }]);
      return;
    }


    this.errorMsg.set('');
    const history = this.assistantMessages()
      .slice(-8)
      .map(message => ({ role: message.role, text: message.text }));
    this.assistantMessages.update(messages => [...messages, { role: 'user', text: question }]);
    this.assistantLoading.set(true);

    this.apiService.runLocalRssiAssistant({
      eventId: this.assistantSelectedEventId ?? (this.shouldReuseAssistantEvent(question) ? this.assistantInferredEventId : null),
      question,
      history
    }).subscribe({
      next: (result: AssistantResponse) => {
        this.assistantResult.set(result);
        if (result.selectedEventId != null) {
          this.assistantInferredEventId = result.selectedEventId;
        } else if (!this.shouldReuseAssistantEvent(question)) {
          this.assistantInferredEventId = null;
        }
        this.assistantMessages.update(messages => [
          ...messages,
          { role: 'assistant', text: result.answer }
        ]);
        this.assistantQuestion = '';
        this.assistantLoading.set(false);
        if (this.assistantAutoSpeak()) this.speakAssistantAnswer(result.answer);
      },
      error: (err) => {
        const message = err?.error?.message
          || 'L’assistant local ne répond pas. Consultez le diagnostic affiché par Spring Boot.';
        this.assistantMessages.update(messages => [
          ...messages,
          { role: 'assistant', text: message }
        ]);
        this.assistantLoading.set(false);
      }
    });
  }

  private shouldReuseAssistantEvent(question: string): boolean {
    const normalized = this.normalizeSearch(question);
    if (!this.assistantInferredEventId) return false;
    const followUpTerms = [
      'alors', 'cet evenement', 'ce probleme', 'celui ci', 'ses risques', 'les risques',
      'que faire', 'quoi faire', 'actions', 'solution', 'explique le', 'continue',
      'et apres', 'comment traiter', 'comment resoudre', 'qualification', 'incident'
    ];
    return followUpTerms.some(term => normalized.includes(this.normalizeSearch(term)))
      || normalized.split(/\s+/).filter(Boolean).length <= 4;
  }

  onAssistantEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) return;
    keyboardEvent.preventDefault();
    if (!this.assistantLoading()) this.sendAssistantMessage();
  }

  toggleAssistantSpeech(): void {
    this.assistantAutoSpeak.update(value => !value);
    if (!this.assistantAutoSpeak() && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  speakAssistantAnswer(text?: string): void {
    const content = (text || this.assistantResult()?.answer || '').trim();
    if (!content || !('speechSynthesis' in window)) {
      if (!('speechSynthesis' in window)) {
        this.errorMsg.set('La lecture vocale n’est pas disponible dans ce navigateur.');
      }
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      content.replace(/\*\*/g, '').replace(/[#•]/g, ' ')
    );
    utterance.lang = 'fr-FR';
    utterance.rate = 0.96;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  applyAssistantActions(): void {
    const result = this.assistantResult();
    if (!result) return;

    const eventId = result.selectedEventId ?? this.assistantInferredEventId;
    if (!eventId && result.askToCreateEvent) {
      this.prepareNewEventFromAssistant(result);
      return;
    }
    if (!eventId) {
      this.assistantMessages.update(messages => [...messages, {
        role: 'assistant',
        text: "Je peux préparer une nouvelle déclaration à partir de votre description. Décrivez le symptôme principal puis utilisez la proposition de création affichée sous la conversation."
      }]);
      return;
    }

    const event = this.events().find(item => item.id === eventId);
    if (!event) {
      this.assistantMessages.update(messages => [...messages, { role: 'assistant', text: 'La déclaration associée n’est plus disponible. Rechargez les événements puis réessayez.' }]);
      return;
    }
    this.beginAssistantQualification(event, result);
  }

  private prepareNewEventFromAssistant(result: AssistantResponse): void {
    const draft = result.eventDraft || {};
    const initial = this.initEventForm();
    this.selectedEvent.set(null);
    this.eventForm = { ...initial };
    this.eventFormError.set('');
    this.eventFormSuccess.set('L’assistant prépare une nouvelle déclaration. Vérifiez chaque proposition avant de l’enregistrer.');
    this.assistantPendingNewEventResult.set(result);
    this.assistantEventAutofillActive.set(true);
    this.showQualifyForm.set(false);
    this.showIncidentForm.set(false);
    this.showEventForm.set(true);
    this.cdr.detectChanges();

    const steps: Array<[keyof Evenement, any]> = [
      ['libelleErreur', draft.libelleErreur || 'Événement technique à analyser'],
      ['descriptionDetaillee', draft.descriptionDetaillee || 'Situation décrite par le RSSI et à compléter après les premières vérifications.'],
      ['detecteParSource', draft.detecteParSource || 'AUTRE'],
      ['idTicket', draft.idTicket || this.generateAssistantTechnicalId('AI-TCK')],
      ['commentaireSource', draft.commentaireSource || 'Déclaration préparée par l’assistant RSSI.'],
      ['natureEvenement', draft.natureEvenement || 'Autre'],
      ['serviceOsAppli', draft.serviceOsAppli || 'À confirmer'],
      ['equipementHardware', draft.equipementHardware || 'À confirmer'],
      ['codeErreur', draft.codeErreur || this.generateAssistantTechnicalId('AI-ERR')],
      ['causesPossibles', draft.causesPossibles || 'Cause à confirmer par les journaux, les tests et les changements récents.'],
      ['etat', draft.etat || 'Ouvert'],
      ['appreciation', draft.appreciation || 'À confirmer par le RSSI'],
      ['evaluation', draft.evaluation || 'Analyse initiale assistée'],
      ['impactNiveau', draft.impactNiveau || 'Majeur'],
      ['impactCommentaire', draft.impactCommentaire || 'Niveau initial à confirmer lors de la qualification CID.'],
      ['typeActif', draft.typeActif || 'Système d’information'],
      ['actifAffecte', draft.actifAffecte || draft.equipementHardware || 'À confirmer']
    ];

    steps.forEach(([field, value], index) => {
      window.setTimeout(() => {
        (this.eventForm as any)[field] = value;
        this.moveAssistantCursorToField(String(field));
        this.cdr.detectChanges();
        if (index === steps.length - 1) {
          this.assistantEventAutofillActive.set(false);
          this.assistantCursorVisible.set(false);
          this.eventFormSuccess.set('Déclaration préremplie. Vérifiez les informations puis cliquez sur Enregistrer; la qualification sera ensuite préparée automatiquement.');
        } else {
          this.assistantCursorVisible.set(true);
        }
      }, index * 210);
    });
  }

  private generateAssistantTechnicalId(prefix: string): string {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private beginAssistantQualification(event: Evenement, result: AssistantResponse): void {
    const qualification = result.qualificationDraft || this.buildAssistantQualificationDraft(event);
    this.selectedEvent.set(event);
    this.eventForm = { ...event };
    this.showIncidentForm.set(false);
    this.showQualifyForm.set(true);
    this.assistantAutofillActive.set(true);
    this.qualificationFormSuccess.set("L’assistant prépare les impacts CID. Chaque valeur reste une proposition à confirmer par le RSSI.");
    this.qualificationFormError.set('');
    this.errorMsg.set('');

    const steps: Array<[keyof Evenement, string]> = [
      ['impactConfidentialite', qualification.impactConfidentialite],
      ['commentaireConfidentialite', qualification.commentaireConfidentialite || 'Suggestion de l’assistant à confirmer par le RSSI.'],
      ['impactIntegrite', qualification.impactIntegrite],
      ['commentaireIntegrite', qualification.commentaireIntegrite || 'Suggestion de l’assistant à confirmer par le RSSI.'],
      ['impactDisponibilite', qualification.impactDisponibilite],
      ['commentaireDisponibilite', qualification.commentaireDisponibilite || 'Suggestion de l’assistant à confirmer par le RSSI.']
    ];

    steps.forEach(([field, value], index) => {
      window.setTimeout(() => {
        (this.eventForm as any)[field] = value;
        this.moveAssistantCursorToField(String(field));
        this.onQualificationChange();
        this.cdr.detectChanges();
        if (index === steps.length - 1) {
          if (this.hasCriticalImpact()) {
            this.persistAssistantQualificationAndOpenPlan(event, result);
          } else {
            this.assistantAutofillActive.set(false);
            this.assistantCursorVisible.set(false);
            this.qualificationFormSuccess.set('Qualification proposée. Aucun impact Critique n’est actuellement suggéré; vérifiez les trois axes puis confirmez. La fiche d’incident s’ouvrira uniquement si au moins un axe est Critique.');
          }
        } else {
          this.assistantCursorVisible.set(true);
        }
      }, index * 260);
    });
  }

  private buildAssistantQualificationDraft(event: Evenement): AssistantQualificationDraft {
    const text = this.normalizeSearch([
      event.libelleErreur, event.descriptionDetaillee, event.natureEvenement,
      event.causesPossibles, event.serviceOsAppli, event.equipementHardware
    ].filter(Boolean).join(' '));
    if (/incendie|feu|fumee|alarme/.test(text)) {
      return {
        impactConfidentialite: 'Mineur', impactIntegrite: 'Majeur', impactDisponibilite: 'Critique',
        commentaireDisponibilite: 'Risque d’arrêt des équipements ou du service pendant la mise en sécurité.',
        commentaireIntegrite: 'Les équipements et données en cours de traitement peuvent être affectés.',
        commentaireConfidentialite: 'Aucun indice direct de divulgation; niveau à confirmer.', qualification: 'INCIDENT'
      };
    }
    if (/panne|indisponibilite|serveur|reseau/.test(text)) {
      return {
        impactConfidentialite: 'Mineur', impactIntegrite: 'Majeur', impactDisponibilite: 'Critique',
        commentaireDisponibilite: 'Le service peut être indisponible pour les utilisateurs.',
        commentaireIntegrite: 'Des traitements interrompus ou incomplets sont possibles.',
        commentaireConfidentialite: 'Aucun indice direct de divulgation; niveau à confirmer.', qualification: 'INCIDENT'
      };
    }
    if (/auth|acces|compte|phishing|malware/.test(text)) {
      return {
        impactConfidentialite: 'Critique', impactIntegrite: 'Critique', impactDisponibilite: 'Majeur',
        commentaireConfidentialite: 'Un accès non autorisé ou une exposition de données est possible.',
        commentaireIntegrite: 'Une modification non autorisée doit être écartée.',
        commentaireDisponibilite: 'Le service ou les comptes peuvent être perturbés.', qualification: 'INCIDENT'
      };
    }
    return {
      impactConfidentialite: event.impactConfidentialite as any || 'Mineur',
      impactIntegrite: event.impactIntegrite as any || 'Majeur',
      impactDisponibilite: event.impactDisponibilite as any || 'Critique',
      commentaireConfidentialite: event.commentaireConfidentialite || 'Niveau proposé par l’assistant; à confirmer.',
      commentaireIntegrite: event.commentaireIntegrite || 'Niveau proposé par l’assistant; à confirmer.',
      commentaireDisponibilite: event.commentaireDisponibilite || 'Niveau proposé par l’assistant; à confirmer.',
      qualification: 'INCIDENT'
    };
  }

  private persistAssistantQualificationAndOpenPlan(event: Evenement, result: AssistantResponse): void {
    if (!event.id) return;
    const payload = {
      typeActif: this.eventForm.typeActif || event.typeActif || '',
      actifAffecte: this.eventForm.actifAffecte || event.actifAffecte || '',
      impactConfidentialite: this.eventForm.impactConfidentialite || '',
      impactIntegrite: this.eventForm.impactIntegrite || '',
      impactDisponibilite: this.eventForm.impactDisponibilite || '',
      commentaireConfidentialite: this.eventForm.commentaireConfidentialite || '',
      commentaireIntegrite: this.eventForm.commentaireIntegrite || '',
      commentaireDisponibilite: this.eventForm.commentaireDisponibilite || ''
    };
    this.apiService.qualifyEvent(event.id, payload).subscribe({
      next: saved => {
        const qualified = { ...event, ...saved } as Evenement;
        this.selectedEvent.set(qualified);
        this.showQualifyForm.set(false);
        const existingIncident = this.findIncidentForEvent(event.id!);
        if (existingIncident) this.openEditIncident(existingIncident);
        else this.openNewIncidentForEvent(qualified);
        const draft = result.incidentDraft || {};
        const actionsText = result.actions.map((action, index) => `${index + 1}. ${action}`).join('\n');
        this.animateIncidentDraft([
          ['typesIncident', draft.typesIncident || this.incidentForm.typesIncident],
          ['niveauImpact', draft.niveauImpact || this.incidentForm.niveauImpact],
          ['mesureAction', draft.mesureAction || this.incidentForm.mesureAction],
          ['mesureEtat', draft.mesureEtat || this.incidentForm.mesureEtat || 'En cours'],
          ['traitementAction', draft.traitementAction || actionsText || this.incidentForm.traitementAction],
          ['traitementEtat', draft.traitementEtat || this.incidentForm.traitementEtat || 'En cours'],
          ['preconisation', draft.preconisation || result.answer || this.incidentForm.preconisation],
          ['actionCorrective', draft.actionCorrective || this.incidentForm.actionCorrective],
          ['impactContinuite', draft.impactContinuite ?? this.incidentForm.impactContinuite],
          ['impactContinuiteDescription', draft.impactContinuiteDescription || this.incidentForm.impactContinuiteDescription],
          ['changementDeclenche', draft.changementDeclenche ?? this.incidentForm.changementDeclenche],
          ['changementDeclencheDescription', draft.changementDeclencheDescription || this.incidentForm.changementDeclencheDescription],
          ['risques', (draft.risques || this.incidentForm.risques || []).map(risk => ({ ...risk, reference: risk.reference || '' }))]
        ]);
        this.loadEvents();
        this.loadLogs();
      },
      error: err => {
        this.assistantAutofillActive.set(false);
        this.qualificationFormError.set(err?.error?.message || "Impossible d'enregistrer la qualification proposée par l'assistant.");
      }
    });
  }

  private animateIncidentDraft(entries: Array<[keyof Incident, any]>): void {
    const completeEntries = this.completeAssistantIncidentEntries(entries);
    if (completeEntries.length === 0) {
      this.assistantAutofillActive.set(false);
      this.incidentFormError.set("L'assistant n'a fourni aucun champ exploitable pour le plan d'incident.");
      return;
    }

    this.assistantCursorVisible.set(true);
    this.incidentFormSuccess.set('Remplissage assisté en cours…');
    completeEntries.forEach(([field, value], index) => {
      window.setTimeout(() => {
        this.moveAssistantCursorToField(String(field));
        (this.incidentForm as any)[field] = value;
        this.cdr.detectChanges();
        if (index === completeEntries.length - 1) {
          window.setTimeout(() => {
            this.assistantAutofillActive.set(false);
            this.assistantCursorVisible.set(false);
            this.incidentFormSuccess.set("La fiche a été préremplie. Vérifiez les propositions puis cliquez sur Confirmer pour l’enregistrer.");
            this.incidentFormError.set('');
          }, 450);
        }
      }, index * 360);
    });
  }

  private completeAssistantIncidentEntries(entries: Array<[keyof Incident, any]>): Array<[keyof Incident, any]> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 5);
    const username = this.apiService.currentUser()?.username || 'RSSI';
    const defaults: Partial<Incident> = {
      typesIncident: ['Autre'],
      niveauImpact: 'NIVEAU_3',
      dureeIndisponibilite: this.incidentForm.dureeIndisponibilite || 'À confirmer',
      mesureActionNumero: this.incidentForm.mesureActionNumero || 'MES-01',
      mesureAction: 'Confirmer le périmètre, préserver les preuves et appliquer une mesure de confinement réversible.',
      mesureResponsable: username,
      mesureDelai: 'Immédiat',
      mesureEtat: 'En cours',
      mesureDDT: today,
      heureAttenuation: time,
      traitementAction: 'Analyser la cause, corriger le composant concerné, restaurer le service puis surveiller le retour à la normale.',
      traitementDDT: today,
      traitementHDT: time,
      traitementResponsable: username,
      traitementEtat: 'En cours',
      preconisation: 'Renforcer la supervision, documenter la cause racine et mettre à jour les procédures préventives.',
      actionCorrective: 'Corriger durablement la cause après validation technique et tester l’efficacité de la mesure.',
      correctiveResponsable: username,
      correctiveDateDebut: today,
      efficacite: 'Oui',
      commentaireEfficacite: 'À mesurer après stabilisation du service.',
      hasRisquesAssocies: true,
      impactContinuite: true,
      impactContinuiteDescription: 'Impact potentiel sur la continuité du service à confirmer par le RSSI.',
      capitalisation: true,
      evenementsSimilaires: 'Non',
      changementDeclenche: false,
      miseAJourPcaNecessaire: false,
      risques: [{ reference: '', description: 'Risque opérationnel lié à l’événement, à préciser et confirmer par le RSSI.' }],
      risquesAMettreAJour: false,
      suiviEdition: this.incidentForm.suiviEdition || '1',
      suiviDate: today,
      suiviAuteur: username,
      suiviCommentaires: 'Fiche préremplie par l’assistant; validation humaine obligatoire.'
    };
    const provided = new Map<keyof Incident, any>();
    entries.forEach(([field, rawValue]) => {
      const value = this.normalizeAssistantIncidentValue(field, rawValue);
      if (value !== undefined && value !== null && value !== '') provided.set(field, value);
    });
    const order: (keyof Incident)[] = [
      'typesIncident', 'niveauImpact', 'dureeIndisponibilite', 'mesureActionNumero', 'mesureAction',
      'mesureResponsable', 'mesureDelai', 'mesureEtat', 'mesureDDT', 'heureAttenuation',
      'traitementAction', 'traitementDDT', 'traitementHDT', 'traitementResponsable', 'traitementEtat',
      'preconisation', 'actionCorrective', 'correctiveResponsable', 'correctiveDateDebut',
      'efficacite', 'commentaireEfficacite', 'hasRisquesAssocies', 'impactContinuite',
      'impactContinuiteDescription', 'capitalisation', 'evenementsSimilaires', 'changementDeclenche',
      'miseAJourPcaNecessaire', 'risques', 'risquesAMettreAJour', 'suiviEdition', 'suiviDate',
      'suiviAuteur', 'suiviCommentaires'
    ];
    return order.map(field => [field, provided.has(field) ? provided.get(field) : (defaults as any)[field]])
      .filter(([, value]) => value !== undefined && value !== null && value !== '') as Array<[keyof Incident, any]>;
  }

  private normalizeAssistantIncidentValue(field: keyof Incident, value: any): any {
    if (field === 'typesIncident') {
      const values = Array.isArray(value) ? value : String(value || '').split(/[,;|]/);
      return values.map(item => String(item).trim()).filter(Boolean);
    }
    if (field === 'risques') {
      const values = Array.isArray(value) ? value : [];
      return values
        .map((risk: any) => ({
          reference: String(risk?.reference || '').trim(),
          description: String(risk?.description || '').trim()
        }))
        .filter((risk: Risque) => Boolean(risk.description));
    }
    if (['hasRisquesAssocies', 'impactContinuite', 'capitalisation', 'changementDeclenche', 'miseAJourPcaNecessaire', 'risquesAMettreAJour'].includes(String(field))) {
      if (typeof value === 'boolean') return value;
      const normalized = String(value || '').trim().toLowerCase();
      return ['true', 'oui', '1', 'yes'].includes(normalized);
    }
    if (field === 'niveauImpact') {
      const normalized = String(value || '').toUpperCase().replace(/\s+/g, '_');
      return ['NIVEAU_1', 'NIVEAU_2', 'NIVEAU_3', 'NIVEAU_4'].includes(normalized) ? normalized : 'NIVEAU_3';
    }
    return typeof value === 'string' ? value.trim() : value;
  }

  private moveAssistantCursorToField(field: string): void {
    const element = document.querySelector(`[name="${field}"], #${field}`) as HTMLElement | null;
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const rect = element.getBoundingClientRect();
    this.assistantCursorPosition.set({ x: Math.max(18, rect.left + Math.min(36, rect.width / 2)), y: Math.max(18, rect.top + Math.min(28, rect.height / 2)) });
  }

  cancelAssistantProposal(): void {
    if (!this.assistantResult()) {
      return;
    }
    this.assistantResult.set(null);
    this.assistantPendingNewEventResult.set(null);
    this.assistantEventAutofillActive.set(false);
    this.assistantMessages.update(messages => [
      ...messages,
      {
        role: 'assistant',
        text: 'Proposition annulée. Aucune action n’a été ajoutée au plan d’incident. Vous pouvez préciser le contexte et poser une nouvelle question.'
      }
    ]);
    this.successMsg.set('Proposition annulée sans modification du plan d’incident.');
    this.errorMsg.set('');
  }

  clearAssistantConversation(): void {
    this.assistantResult.set(null);
    this.assistantQuestion = '';
    this.assistantInferredEventId = null;
    this.assistantPendingNewEventResult.set(null);
    this.assistantEventAutofillActive.set(false);
    this.assistantMessages.set([
      {
        role: 'assistant',
        text: 'Nouvelle conversation prête. Posez une question sur TELNET ou décrivez la situation avec vos propres mots.'
      }
    ]);
  }

  openSettings(): void {
    const current = this.apiService.currentUser();
    this.userForm = {
      username: current?.username || '',
      email: current?.email || '',
      role: current?.role || '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    };
    this.activeTab.set('settings');
    this.successMsg.set('');
    this.errorMsg.set('');
    this.closeSidebar();
  }


  saveUserProfile(): void {
    const user = this.apiService.currentUser();
    const trimmedUsername = (this.userForm.username || '').trim();
    const trimmedEmail = (this.userForm.email || '').trim();
    const newPassword = this.userForm.newPassword || '';
    const emailChanged = trimmedEmail.toLowerCase() !== (user?.email || '').trim().toLowerCase();
    const passwordChanged = newPassword.length > 0;

    this.successMsg.set('');
    this.errorMsg.set('');

    if (!trimmedUsername) {
      this.errorMsg.set("Le nom d'utilisateur ne peut pas être vide.");
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      this.errorMsg.set("Veuillez saisir une adresse email valide.");
      return;
    }
    if (passwordChanged && newPassword !== this.userForm.confirmPassword) {
      this.errorMsg.set('La confirmation du nouveau mot de passe ne correspond pas.');
      return;
    }
    if (passwordChanged && !this.isStrongPassword(newPassword)) {
      this.errorMsg.set('Le nouveau mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial.');
      return;
    }
    if ((emailChanged || passwordChanged) && !this.userForm.currentPassword) {
      this.errorMsg.set("Saisissez votre mot de passe actuel pour modifier l'email ou le mot de passe.");
      return;
    }
    if (!user?.id) {
      this.errorMsg.set('Impossible de mettre à jour le profil.');
      return;
    }

    this.isSubmitting.set(true);
    this.apiService.updateUserProfile(user.id, {
      username: trimmedUsername,
      email: trimmedEmail,
      role: user.role,
      currentPassword: this.userForm.currentPassword || undefined,
      newPassword: passwordChanged ? newPassword : undefined
    }).subscribe({
      next: () => {
        this.userForm.currentPassword = '';
        this.userForm.newPassword = '';
        this.userForm.confirmPassword = '';
        this.successMsg.set(passwordChanged ? 'Profil et mot de passe mis à jour avec succès.' : 'Profil mis à jour avec succès.');
        this.errorMsg.set('');
        this.isSubmitting.set(false);
      },
      error: (err) => {
        const message = err?.error?.message || 'Erreur lors de la sauvegarde du profil.';
        this.errorMsg.set(message);
        this.isSubmitting.set(false);
      }
    });
  }

  isStrongPassword(password: string): boolean {
    return password.length >= 8
      && /[A-Z]/.test(password)
      && /[a-z]/.test(password)
      && /\d/.test(password)
      && /[@$!%*?&]/.test(password);
  }

  showNewPasswordRule(): boolean {
    const value = this.userForm.newPassword || '';
    return value.length > 0 && !this.isStrongPassword(value);
  }

  showPasswordMismatch(): boolean {
    const confirmation = this.userForm.confirmPassword || '';
    return confirmation.length > 0 && confirmation !== (this.userForm.newPassword || '');
  }

  findIncidentForEvent(eventId: number): Incident | undefined {
    return this.incidents().find(inc => inc.evenement?.id === eventId);
  }

  openEditEvent(event: Evenement): void {
    this.eventFormError.set('');
    this.eventFormSuccess.set('');
    this.selectedEvent.set(event);
    this.eventForm = { ...event, referenceEvenement: event.referenceEvenement || (event.id ? `EV-${event.id}` : this.generateEventReference()) };
    if (event.dateHeureDetection) {
      this.eventForm.dateHeureDetection = event.dateHeureDetection.slice(0, 16);
    }
    this.eventForm.natureEvenement = this.eventForm.natureEvenement || 'Indisponibilite';
    this.eventForm.etat = this.eventForm.etat || 'OPEN';
    this.eventForm.impactNiveau = this.eventForm.impactNiveau || 'Aucun';
    this.showEventForm.set(true);
  }

  saveEvent(): void {
    const validationError = this.validateEventFormComplete(this.eventForm);
    if (validationError) {
      this.eventFormError.set(validationError);
      return;
    }
    this.eventForm.idTicket = this.eventForm.idTicket.trim();
    this.eventForm.codeErreur = this.eventForm.codeErreur.trim();
    this.eventForm.impactMineur = this.eventForm.impactNiveau === 'Mineur';

    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);
    const wasEditing = Boolean(this.selectedEvent());

    const operation = wasEditing
      ? this.apiService.updateEvent(this.selectedEvent()!.id!, this.eventForm)
      : this.apiService.createEvent(this.eventForm);

    operation.subscribe({
      next: (saved) => {
        const pendingAssistantResult = this.assistantPendingNewEventResult();
        const createdEvent = { ...this.eventForm, ...(saved || {}) } as Evenement;
        this.eventFormSuccess.set(wasEditing
          ? 'Événement mis à jour avec succès.'
          : (this.apiService.isRssi()
              ? 'Événement enregistré avec succès.'
              : 'Événement enregistré avec succès. Cliquez sur « Envoyer au RSSI » pour notifier le RSSI.'));
        this.eventFormError.set('');

        if (pendingAssistantResult && !wasEditing && createdEvent.id) {
          const continuedResult: AssistantResponse = {
            ...pendingAssistantResult,
            selectedEventId: createdEvent.id,
            askToCreateEvent: false,
            askToFillIncident: true
          };
          this.assistantPendingNewEventResult.set(null);
          this.assistantEventAutofillActive.set(false);
          this.assistantResult.set(continuedResult);
          this.assistantInferredEventId = createdEvent.id;
          this.selectedEvent.set(createdEvent);
          this.events.update(items => [createdEvent, ...items.filter(item => item.id !== createdEvent.id)]);
          this.showEventForm.set(false);
          this.eventForm = this.initEventForm();
          this.loadEvents();
          this.loadLogs();
          this.isSubmitting.set(false);
          window.setTimeout(() => this.beginAssistantQualification(createdEvent, continuedResult), 350);
          return;
        }

        if (this.apiService.isRssi()) {
          this.showEventForm.set(false);
          this.selectedEvent.set(null);
          this.eventForm = this.initEventForm();
        } else if (saved?.id) {
          this.selectedEvent.set({ ...this.eventForm, ...saved });
          this.eventForm = { ...this.eventForm, ...saved };
        }

        this.loadEvents();
        this.loadLogs();
        this.isSubmitting.set(false);
      },
      error: (err) => {
        this.eventFormSuccess.set('');
        this.eventFormError.set(err?.error?.message || 'Erreur de validation ou problème de connexion serveur.');
        this.isSubmitting.set(false);
      }
    });
  }

  sendEventToRssi(event?: Evenement): void {
    const formData = event ? { ...event } : { ...this.eventForm };
    const validationError = this.validateEventFormComplete(formData);
    if (validationError) {
      this.eventFormError.set(validationError);
      return;
    }
    if (formData.envoyeAuRssi) {
      this.eventFormError.set('Cet événement a déjà été envoyé au RSSI.');
      return;
    }

    formData.impactMineur = formData.impactNiveau === 'Mineur';
    if (this.isSendingToRssi()) return;
    this.isSendingToRssi.set(true);

    const saveOperation = formData.id
      ? this.apiService.updateEvent(formData.id, formData)
      : this.apiService.createEvent(formData);

    saveOperation.subscribe({
      next: (saved) => {
        const eventId = saved?.id ?? formData.id;
        if (!eventId) {
          this.eventFormError.set('Impossible d\'envoyer au RSSI : événement non enregistré.');
          this.isSendingToRssi.set(false);
          return;
        }

        this.apiService.notifyRssiEvent(eventId).subscribe({
          next: () => {
            this.eventFormSuccess.set('Événement enregistré et envoyé au RSSI avec succès.');
            this.eventFormError.set('');
            this.showEventForm.set(false);
            this.selectedEvent.set(null);
            this.loadEvents();
            this.loadLogs();
            this.isSendingToRssi.set(false);
          },
          error: (err) => {
            this.eventFormError.set(err?.error?.message || 'Erreur lors de l\'envoi au RSSI.');
            this.loadEvents();
            this.isSendingToRssi.set(false);
          }
        });
      },
      error: (err) => {
        this.eventFormError.set(err?.error?.message || 'Erreur lors de l\'enregistrement de l\'événement. Vérifiez les champs obligatoires.');
        this.isSendingToRssi.set(false);
      }
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
    this.qualificationFormError.set('');
    this.qualificationFormSuccess.set('');
    this.selectedEvent.set(event);
    this.eventForm = { ...event, referenceEvenement: event.referenceEvenement || (event.id ? `EV-${event.id}` : this.generateEventReference()) };

    this.eventForm.impactConfidentialite = this.eventForm.impactConfidentialite === 'Aucun' ? '' : (this.eventForm.impactConfidentialite || '');
    this.eventForm.impactIntegrite = this.eventForm.impactIntegrite === 'Aucun' ? '' : (this.eventForm.impactIntegrite || '');
    this.eventForm.impactDisponibilite = this.eventForm.impactDisponibilite === 'Aucun' ? '' : (this.eventForm.impactDisponibilite || '');
    this.eventForm.commentaireConfidentialite = this.eventForm.commentaireConfidentialite || '';
    this.eventForm.commentaireIntegrite = this.eventForm.commentaireIntegrite || '';
    this.eventForm.commentaireDisponibilite = this.eventForm.commentaireDisponibilite || '';

    const existingIncident = event.id ? this.findIncidentForEvent(event.id) : undefined;
    this.selectedIncident.set(existingIncident || null);
    this.incidentForm = existingIncident
      ? {
          ...this.initIncidentForm(event.id || 0),
          ...existingIncident,
          evenement: { ...(existingIncident.evenement || {}), id: event.id || 0 },
          risques: (existingIncident.risques || []).map(risk => ({ ...risk }))
        }
      : this.initIncidentForm(event.id || 0);
    this.selectedExistingRiskReference = '';
    this.onQualificationChange();
    this.showQualifyForm.set(true);
  }

  onQualificationChange(): void {
    this.qualifyValue = this.hasCriticalImpact() ? 'INCIDENT' : 'NON_INCIDENT';
    this.qualificationFormError.set('');
    if (this.hasCriticalImpact()) {
      this.qualificationFormSuccess.set('Au moins un impact est Critique : l’événement sera qualifié comme incident après confirmation.');
    } else {
      this.qualificationFormSuccess.set('');
    }
  }

  hasCriticalImpact(): boolean {
    return [
      this.eventForm.impactConfidentialite,
      this.eventForm.impactIntegrite,
      this.eventForm.impactDisponibilite
    ].some(value => value === 'Critique');
  }

  qualificationImpactsComplete(): boolean {
    return this.areQualificationImpactsComplete();
  }

  private areQualificationImpactsComplete(): boolean {
    const allowed = new Set(['Mineur', 'Majeur', 'Critique']);
    return [
      this.eventForm.impactConfidentialite,
      this.eventForm.impactIntegrite,
      this.eventForm.impactDisponibilite
    ].every(value => allowed.has(value || ''));
  }

  // --- Risks Handling ---
  addRisque(): void {
    this.incidentForm.risques.push({ reference: '', description: '' });
  }

  removeRisque(index: number): void {
    this.incidentForm.risques.splice(index, 1);
  }

  submitQualification(): void {
    const selected = this.selectedEvent();
    if (!selected?.id || this.isSubmitting()) return;

    if (!this.areQualificationImpactsComplete()) {
      this.qualificationFormError.set('Renseignez les trois impacts CID avec Mineur, Majeur ou Critique.');
      return;
    }

    this.onQualificationChange();
    const qualifiedEvent: Evenement = {
      ...selected,
      impactConfidentialite: this.eventForm.impactConfidentialite,
      impactIntegrite: this.eventForm.impactIntegrite,
      impactDisponibilite: this.eventForm.impactDisponibilite,
      commentaireConfidentialite: this.eventForm.commentaireConfidentialite || '',
      commentaireIntegrite: this.eventForm.commentaireIntegrite || '',
      commentaireDisponibilite: this.eventForm.commentaireDisponibilite || '',
      qualification: this.qualifyValue,
      qualifiePar: this.apiService.currentUser()?.username || selected.qualifiePar
    };

    this.isSubmitting.set(true);
    this.qualificationFormError.set('');
    this.qualificationFormSuccess.set('Enregistrement de la qualification…');
    this.apiService.qualifyEvent(selected.id, {
      typeActif: qualifiedEvent.typeActif || '',
      actifAffecte: qualifiedEvent.actifAffecte || '',
      impactConfidentialite: qualifiedEvent.impactConfidentialite || '',
      impactIntegrite: qualifiedEvent.impactIntegrite || '',
      impactDisponibilite: qualifiedEvent.impactDisponibilite || '',
      commentaireConfidentialite: qualifiedEvent.commentaireConfidentialite || '',
      commentaireIntegrite: qualifiedEvent.commentaireIntegrite || '',
      commentaireDisponibilite: qualifiedEvent.commentaireDisponibilite || ''
    }).subscribe({
      next: (savedEvent) => {
        const event = { ...qualifiedEvent, ...savedEvent } as Evenement;
        this.selectedEvent.set(event);
        this.showQualifyForm.set(false);

        if (this.qualifyValue !== 'INCIDENT') {
          this.qualificationFormSuccess.set('Événement classé sans suite.');
          this.isSubmitting.set(false);
          this.loadEvents();
          this.loadLogs();
          return;
        }

        const existingIncident = this.findIncidentForEvent(selected.id!);
        this.isSubmitting.set(false);
        this.loadEvents();
        this.loadLogs();
        window.setTimeout(() => {
          if (existingIncident?.id) {
            this.openEditIncident(existingIncident);
            this.incidentFormSuccess.set('Événement qualifié comme incident. Le plan existant est ouvert.');
            return;
          }
          this.openNewIncidentForEvent(event);
          this.incidentFormSuccess.set('Événement qualifié comme incident. Complétez puis enregistrez le plan d’incident.');
        }, 0);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.qualificationFormSuccess.set('');
        this.qualificationFormError.set(err?.error?.message || 'Impossible d’enregistrer la qualification.');
      }
    });
  }

  // --- Incident Operations ---
  private openNewIncidentForEvent(event: Evenement): void {
    if (!event.id) return;
    this.incidentFormError.set('');
    this.incidentFormSuccess.set('');
    this.incidentInvalidRiskIndex.set(null);
    this.selectedEvent.set(event);
    this.selectedIncident.set(null);
    this.incidentForm = this.initIncidentForm(event.id);
    this.prepareIncidentFormDefaults();
    this.showQualifyForm.set(false);
    this.showIncidentForm.set(true);
    this.cdr.detectChanges();
  }

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
    this.incidentFormError.set('');
    this.incidentFormSuccess.set('');
    this.incidentInvalidRiskIndex.set(null);
    this.selectedIncident.set(incident);
    const eventId = incident.evenement?.id || 0;
    this.incidentForm = {
      ...this.initIncidentForm(eventId),
      ...incident,
      evenement: { ...(incident.evenement || {}), id: eventId }
    };
    this.prepareIncidentFormDefaults();
    this.incidentForm.mesureDDT = this.toDateInputValue(incident.mesureDDT);
    this.incidentForm.mesureDateCloture = this.toDateInputValue(incident.mesureDateCloture);
    this.incidentForm.mesureHeureCloture = this.toTimeInputValue(incident.mesureHeureCloture);
    this.incidentForm.traitementDDT = this.toDateInputValue(incident.traitementDDT);
    this.incidentForm.traitementDateCloture = this.toDateInputValue(incident.traitementDateCloture);
    this.incidentForm.correctiveDateDebut = this.toDateInputValue(incident.correctiveDateDebut);
    this.incidentForm.correctiveDateCloture = this.toDateInputValue(incident.correctiveDateCloture);
    this.incidentForm.dateMesureEfficacite = this.toDateInputValue(incident.dateMesureEfficacite);
    this.incidentForm.suiviDate = this.toDateInputValue(incident.suiviDate);
    this.incidentForm.traitementHDT = this.toTimeInputValue(incident.traitementHDT);
    this.incidentForm.traitementHeureCloture = this.toTimeInputValue(incident.traitementHeureCloture);
    this.incidentForm.risques = (this.incidentForm.risques || []).map(risk => ({
      ...risk,
      reference: (risk.reference || '').trim(),
      description: (risk.description || '').trim()
    }));
    this.onUnavailabilityTimeChange();
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
    this.onUnavailabilityTimeChange();
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

  onUnavailabilityTimeChange(): void {
    const event = this.events().find(e => e.id === this.incidentForm.evenement?.id) || this.selectedEvent();
    if (!event?.dateHeureDetection) return;

    const closureCandidates = [
      this.incidentForm.mesureDateCloture && this.incidentForm.mesureHeureCloture
        ? new Date(`${this.incidentForm.mesureDateCloture}T${this.incidentForm.mesureHeureCloture}`)
        : null,
      this.incidentForm.traitementDateCloture && this.incidentForm.traitementHeureCloture
        ? new Date(`${this.incidentForm.traitementDateCloture}T${this.incidentForm.traitementHeureCloture}`)
        : null
    ].filter((value): value is Date => value !== null && !Number.isNaN(value.getTime()));

    const startDt = new Date(event.dateHeureDetection);
    if (Number.isNaN(startDt.getTime())) return;

    const endDt = closureCandidates.length > 0
      ? closureCandidates.reduce((earliest, candidate) =>
          candidate.getTime() < earliest.getTime() ? candidate : earliest
        )
      : new Date();

    if (endDt.getTime() < startDt.getTime()) return;
    this.incidentForm.dureeIndisponibilite = this.formatDurationBetween(startDt, endDt);
  }

  private formatDurationBetween(startDt: Date, endDt: Date): string {
    const totalMinutes = Math.max(0, Math.floor((endDt.getTime() - startDt.getTime()) / 60000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}j`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
    return parts.join(' ');
  }

  saveIncident(): void {
    this.incidentFormError.set('');
    this.incidentFormSuccess.set('');
    this.incidentInvalidRiskIndex.set(null);
    if (!this.incidentForm.evenement?.id) {
      this.incidentFormError.set('Sélectionnez l’événement rattaché à l’incident.');
      return;
    }

    this.onUnavailabilityTimeChange();
    const missingRiskDescription = (this.incidentForm.risques || []).findIndex(risk => !(risk.description || '').trim());
    if (missingRiskDescription >= 0) {
      this.incidentInvalidRiskIndex.set(missingRiskDescription);
      this.incidentFormError.set(`La description du risque n°${missingRiskDescription + 1} est obligatoire.`);
      window.setTimeout(() => document.getElementById(`risk-description-${missingRiskDescription}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
      return;
    }
    this.incidentForm.risques = (this.incidentForm.risques || []).map(risk => ({
      ...risk,
      reference: (risk.reference || '').trim(),
      description: (risk.description || '').trim()
    }));

    // If we're closing, ensure traitementEtat matches
    if (this.incidentForm.traitementDateCloture && this.incidentForm.traitementHeureCloture) {
      this.incidentForm.traitementEtat = 'Clôturé';
    }

    // Sanitize dates to prevent backend parse errors when strings are empty
    const payload = this.sanitizeIncidentPayload(this.incidentForm);

    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);

    const operation = this.selectedIncident()
      ? this.apiService.updateIncident(this.selectedIncident()!.id!, payload)
      : this.apiService.createIncident(payload);

    operation.subscribe({
      next: () => {
        this.incidentFormSuccess.set(this.selectedIncident() ? 'Plan de traitement mis à jour.' : 'Incident qualifié et plan créé.');
        this.incidentFormError.set('');
        this.loadIncidents();
        this.loadRisks();
        this.loadEvents();
        this.loadLogs();
        this.isSubmitting.set(false);
        window.setTimeout(() => this.showIncidentForm.set(false), 1200);
      },
      error: (err) => {
        this.incidentFormError.set(this.extractApiErrorMessage(err, 'Erreur lors de la sauvegarde de l’incident.'));
        this.incidentFormSuccess.set('');
        this.isSubmitting.set(false);
      }
    });
  }

  deleteIncident(id: number): void {
    if (!confirm(`Supprimer définitivement l’incident #${id} ? L’événement associé repassera en attente de qualification.`)) return;

    this.apiService.deleteIncident(id).subscribe({
      next: () => {
        if (this.selectedIncident()?.id === id) {
          this.showIncidentForm.set(false);
          this.selectedIncident.set(null);
        }
        this.successMsg.set(`Incident #${id} supprimé.`);
        this.errorMsg.set('');
        this.loadIncidents();
        this.loadEvents();
        this.loadLogs();
      },
      error: (err) => this.errorMsg.set(err?.error?.message || `Impossible de supprimer l’incident #${id}.`)
    });
  }

  applyLogSearch(): void {
    this.logSearch = this.logSearch.trim();
  }

  startSearchVoice(target: 'events' | 'incidents' | 'logs' | 'assistant'): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.errorMsg.set('La reconnaissance vocale n’est pas disponible. Utilisez une version récente de Chrome ou Edge.');
      return;
    }

    if (this.activeRecognition) this.activeRecognition.stop();

    const recognition = new SpeechRecognition();
    recognition.lang = this.getSpeechLocale(target);
    recognition.interimResults = false;
    recognition.maxAlternatives = 5;
    recognition.continuous = false;
    this.activeVoiceSearch.set(target);
    this.activeRecognition = recognition;

    recognition.onresult = (event: any) => this.ngZone.run(() => {
      const finalResult = Array.from(event.results || []).find((result: any) => result.isFinal) as any
        || event.results?.[event.results.length - 1];
      const alternatives = Array.from(finalResult || []) as any[];
      const candidates = alternatives
        .map(item => String(item?.transcript || '').trim())
        .filter(Boolean);
      const rawText = this.selectBestVoiceCandidate(target, candidates);
      const text = this.cleanVoiceSearchText(rawText, target);

      if (target === 'events') {
        this.eventStateFilter = 'ALL';
        this.eventQualificationFilter = 'ALL';
        this.eventRssiFilter = 'ALL';
        this.eventSearch = text;
      } else if (target === 'incidents') {
        this.incidentStateFilter = 'ALL';
        this.incidentSearch = text;
      } else if (target === 'logs') {
        this.logSearch = text;
      } else {
        this.assistantQuestion = rawText;
      }

      this.activeVoiceSearch.set(null);
      this.activeRecognition = null;
      if (target !== 'assistant') {
        const count = this.countVoiceMatches(target, text);
        this.successMsg.set(rawText ? `Recherche vocale appliquée : « ${rawText} » — ${count} résultat(s).` : 'Aucun mot reconnu.');
      }
      this.cdr.detectChanges();
      window.setTimeout(() => this.cdr.detectChanges(), 0);
    });
    recognition.onerror = (event: any) => this.ngZone.run(() => {
      this.activeVoiceSearch.set(null);
      this.activeRecognition = null;
      const messages: Record<string, string> = {
        'not-allowed': 'Autorisez le microphone dans les paramètres du navigateur.',
        'audio-capture': 'Aucun microphone utilisable n’a été détecté.',
        'no-speech': 'Aucune parole n’a été détectée. Rapprochez-vous du microphone et réessayez.',
        network: 'Le service de reconnaissance vocale du navigateur est indisponible.'
      };
      this.errorMsg.set(messages[event.error] || `Recherche vocale indisponible : ${event.error || 'erreur inconnue'}.`);
      this.cdr.detectChanges();
    });
    recognition.onend = () => this.ngZone.run(() => {
      this.activeVoiceSearch.set(null);
      this.activeRecognition = null;
      this.cdr.detectChanges();
    });
    recognition.start();
  }

  private selectBestVoiceCandidate(target: 'events' | 'incidents' | 'logs' | 'assistant', candidates: string[]): string {
    if (!candidates.length) return '';
    if (target === 'assistant') return candidates[0];
    return [...candidates].sort((left, right) => {
      const rightScore = this.countVoiceMatches(target, this.cleanVoiceSearchText(right, target));
      const leftScore = this.countVoiceMatches(target, this.cleanVoiceSearchText(left, target));
      return rightScore - leftScore;
    })[0];
  }

  private countVoiceMatches(target: 'events' | 'incidents' | 'logs', query: string): number {
    const normalized = this.normalizeSearch(query);
    if (!normalized) return 0;
    if (target === 'events') {
      return this.events().filter(event => this.matchesNormalizedSearch(this.normalizeSearch([
        event.referenceEvenement, event.id, event.libelleErreur, event.descriptionDetaillee,
        event.detecteParSource, event.declarePar, event.etat, event.qualification,
        event.natureEvenement, event.idTicket, event.codeErreur, event.serviceOsAppli
      ].filter(Boolean).join(' ')), normalized)).length;
    }
    if (target === 'incidents') {
      return this.incidents().filter(incident => {
        const event = this.getIncidentEvent(incident);
        return this.matchesNormalizedSearch(this.normalizeSearch([
          incident.id, event?.referenceEvenement, event?.id, event?.libelleErreur,
          event?.descriptionDetaillee, incident.traitementEtat, incident.traitementResponsable,
          incident.niveauImpact, incident.dureeIndisponibilite
        ].filter(Boolean).join(' ')), normalized);
      }).length;
    }
    return this.logs().filter(log => this.matchesNormalizedSearch(this.normalizeSearch([
      log.username, log.action, log.timestamp, new Date(log.timestamp).toLocaleString('fr-FR')
    ].filter(Boolean).join(' ')), normalized)).length;
  }

  private getSpeechLocale(_target: 'events' | 'incidents' | 'logs' | 'assistant' | 'dictation'): string {
    return 'fr-FR';
  }

  private cleanVoiceSearchText(value: string, target: 'events' | 'incidents' | 'logs' | 'assistant'): string {
    if (target === 'assistant') return String(value || '').trim();
    const generic: Record<'events' | 'incidents' | 'logs', Set<string>> = {
      events: new Set(['evenement', 'evenements', 'event', 'events', 'declaration', 'declarations', 'liste', 'tableau', 'tous', 'toutes', 'les', 'des']),
      incidents: new Set(['incident', 'incidents', 'plan', 'plans', 'liste', 'tableau', 'tous', 'toutes', 'les', 'des']),
      logs: new Set(['journal', 'audit', 'audits', 'log', 'logs', 'liste', 'tableau', 'tous', 'toutes', 'les', 'des'])
    };
    const cleaned = String(value || '')
      .replace(/^(cherche|chercher|recherche|rechercher|trouve|trouver|affiche|afficher|montre|montrer|filtre|filtrer|search|find|show|display|filter)(-moi| moi| me)?\s+/i, '')
      .replace(/\b(s'il vous plaît|svp|please|qui contient|contenant|avec le mot|avec les mots)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const normalized = this.normalizeSearch(cleaned).split(/\s+/).filter(Boolean);
    const useful = normalized.filter(token => !generic[target].has(token));
    return (useful.length ? useful : normalized).join(' ');
  }

  logout(): void {
    this.apiService.logout();
    this.router.navigate(['/login']);
  }

  // --- AI Smart Fill (context-aware) ---
  magicFill(targetField?: string, formContext: 'event' | 'incident' = 'event'): void {
    const rawTitle = this.eventForm.libelleErreur || this.selectedEvent()?.libelleErreur || '';

    if (targetField) {
      const targetObject = formContext === 'event' ? this.eventForm : this.incidentForm;
      const currentValue = String((targetObject as any)[targetField] || '').trim();
      const selected = this.selectedEvent();
      const seed = currentValue
        || [rawTitle, this.eventForm.descriptionDetaillee, selected?.descriptionDetaillee]
          .filter(Boolean)
          .join(' — ')
          .trim();

      if (!seed) {
        const message = 'Saisissez quelques mots dans le champ ou dans le titre avant de lancer la génération IA.';
        if (formContext === 'event') this.eventFormError.set(message);
        else this.incidentFormError.set(message);
        return;
      }

      this.aiGeneratingField.set(`${formContext}:${targetField}`);
      if (formContext === 'event') { this.eventFormError.set(''); this.eventFormSuccess.set('Génération IA en cours…'); }
      else { this.incidentFormError.set(''); this.incidentFormSuccess.set('Génération IA en cours…'); }
      this.apiService.generateLocalAiText({
        purpose: formContext === 'event'
          ? 'développer une description professionnelle d’événement de sécurité en 2 ou 3 phrases'
          : `rédiger le champ ${targetField} du plan d’incident en 2 ou 3 phrases`,
        field: targetField,
        seed,
        event: {
          id: selected?.id || this.eventForm.id,
          title: rawTitle,
          description: this.eventForm.descriptionDetaillee || selected?.descriptionDetaillee || '',
          ticket: this.eventForm.idTicket || selected?.idTicket || '',
          errorCode: this.eventForm.codeErreur || selected?.codeErreur || '',
          service: this.eventForm.serviceOsAppli || selected?.serviceOsAppli || '',
          equipment: this.eventForm.equipementHardware || selected?.equipementHardware || '',
          confidentiality: this.eventForm.impactConfidentialite || selected?.impactConfidentialite || '',
          integrity: this.eventForm.impactIntegrite || selected?.impactIntegrite || '',
          availability: this.eventForm.impactDisponibilite || selected?.impactDisponibilite || ''
        },
        incident: this.incidentForm as unknown as Record<string, unknown>
      }).subscribe({
        next: result => {
          (targetObject as any)[targetField] = result.text;
          this.aiGeneratingField.set(null);
          const message = result.modelAvailable === false
            ? 'Texte développé par le moteur de secours. Configurez OpenAI ou Ollama pour une génération réellement conversationnelle.'
            : 'Texte généré par le modèle IA. Vérifiez-le avant l’enregistrement.';
          if (formContext === 'event') this.eventFormSuccess.set(message);
          else this.incidentFormSuccess.set(message);
          this.cdr.detectChanges();
        },
        error: () => {
          const fallback = this.expandEventDescription(seed);
          (targetObject as any)[targetField] = fallback;
          this.aiGeneratingField.set(null);
          if (formContext === 'event') {
            this.eventFormSuccess.set('Texte développé par le moteur de secours. Vérifiez-le avant l’enregistrement.');
            this.eventFormError.set('');
          } else {
            this.incidentFormSuccess.set('Texte développé par le moteur de secours. Vérifiez-le avant l’enregistrement.');
            this.incidentFormError.set('');
          }
          this.cdr.detectChanges();
        }
      });
      return;
    }

    const title = rawTitle.toLowerCase();
    if (!title) {
      this.eventFormError.set("Veuillez d'abord saisir un titre de problème.");
      return;
    }
    const suggestions = this.buildAiSuggestions(title);
    if (formContext === 'event' || this.showEventForm()) {
      this.eventForm.causesPossibles = this.eventForm.causesPossibles || suggestions.causesPossibles;
      this.eventForm.appreciation = this.eventForm.appreciation || suggestions.appreciation;
      this.eventForm.evaluation = this.eventForm.evaluation || suggestions.evaluation;
      this.eventForm.impact = this.eventForm.impact || suggestions.impact;
      this.eventForm.natureEvenement = this.eventForm.natureEvenement || suggestions.natureEvenement;
      this.eventForm.detecteParSource = this.eventForm.detecteParSource || suggestions.detecteParSource;
      this.eventForm.impactNiveau = this.eventForm.impactNiveau || suggestions.impactNiveau;
      this.applySmartDateFromTitle(title);
    }
    this.eventFormSuccess.set('Suggestions ajoutées dans les champs vides.');
  }

  private buildAiSuggestions(title: string) {
    if (title.includes('panne') || title.includes('serveur')) {
      return {
        descriptionDetaillee: 'Le serveur principal a cessé de répondre, entraînant une indisponibilité temporaire des services.',
        causesPossibles: 'Coupure réseau, défaillance matérielle ou surcharge système.',
        appreciation: 'Impact significatif sur la disponibilité des services métiers.',
        evaluation: 'Priorité élevée : intervention immédiate requise.',
        impact: 'Utilisateurs bloqués sur les applications concernées.',
        natureEvenement: 'Indisponibilite',
        detecteParSource: 'SUPERVISION',
        impactNiveau: 'Majeur',
        preconisation: 'Mettre en place une redondance serveur et un plan de bascule.',
        traitementAction: 'Redémarrage contrôlé et vérification des logs système.',
        actionCorrective: 'Remplacement du composant défectueux et renforcement de la supervision.',
        impactContinuiteDescription: 'Interruption partielle des services pendant la panne.',
        commentaireEfficacite: 'Mesures d\'atténuation appliquées, suivi post-incident nécessaire.',
        changementDeclencheDescription: 'Déploiement d\'un correctif ou d\'un patch de sécurité.'
      };
    }
    if (title.includes('feu') || title.includes('incendie') || title.includes('physique')) {
      return {
        descriptionDetaillee: 'Un incident physique a été signalé sur le site ou le datacenter.',
        causesPossibles: 'Surchauffe, défaillance électrique ou incident environnemental.',
        appreciation: 'Risque matériel et opérationnel important.',
        evaluation: 'Situation critique nécessitant une escalade RSSI.',
        impact: 'Accès physique restreint et services impactés.',
        natureEvenement: 'Autre',
        detecteParSource: 'UTILISATEUR',
        impactNiveau: 'Majeur',
        preconisation: 'Renforcer les contrôles environnementaux et le plan PCA.',
        traitementAction: 'Isolation de la zone et sécurisation des équipements.',
        actionCorrective: 'Inspection complète et remise en service progressive.',
        impactContinuiteDescription: 'Activation possible du plan de continuité.',
        commentaireEfficacite: 'Efficacité à valider après remise en service.',
        changementDeclencheDescription: 'Mise à jour des procédures de sécurité physique.'
      };
    }
    if (title.includes('mot de passe') || title.includes('accès') || title.includes('vpn')) {
      return {
        descriptionDetaillee: 'Des tentatives d\'accès suspectes ou un blocage d\'accès ont été constatés.',
        causesPossibles: 'Tentative de connexion abusive, compte verrouillé ou erreur d\'authentification.',
        appreciation: 'Risque modéré sur la sécurité des accès.',
        evaluation: 'Analyse des journaux d\'authentification recommandée.',
        impact: 'Accès limité pour un ou plusieurs utilisateurs.',
        natureEvenement: 'Erreur applicative',
        detecteParSource: 'HELP_DESK',
        impactNiveau: 'Mineur',
        preconisation: 'Renforcer l\'authentification et la politique de mots de passe.',
        traitementAction: 'Réinitialisation des accès et blocage des IP suspectes.',
        actionCorrective: 'Déploiement du MFA et revue des comptes sensibles.',
        impactContinuiteDescription: 'Impact limité à un périmètre utilisateur restreint.',
        commentaireEfficacite: 'Contrôles d\'accès rétablis après action corrective.',
        changementDeclencheDescription: 'Durcissement des règles d\'accès distant.'
      };
    }
    return {
      descriptionDetaillee: 'Anomalie détectée nécessitant une analyse complémentaire.',
      causesPossibles: 'Cause exacte en cours d\'investigation.',
      appreciation: 'Impact à confirmer avec les équipes métiers.',
      evaluation: 'Qualification RSSI requise après collecte des éléments.',
      impact: 'Impact métier à préciser.',
      natureEvenement: 'Autre',
      detecteParSource: 'HELP_DESK',
      impactNiveau: 'Mineur',
      preconisation: 'Documenter l\'incident et renforcer la surveillance.',
      traitementAction: 'Actions correctives à définir selon l\'analyse.',
      actionCorrective: 'Suivi des mesures préventives adaptées.',
      impactContinuiteDescription: 'Continuité à évaluer selon la durée de l\'incident.',
      commentaireEfficacite: 'Efficacité des mesures à mesurer après clôture.',
      changementDeclencheDescription: 'Changement éventuel à planifier après analyse.'
    };
  }

  private applyFieldSuggestion(formContext: 'event' | 'incident', field: string, suggestions: ReturnType<typeof this.buildAiSuggestions>): void {
    const suggestionMap: Record<string, string | undefined> = {
      libelleErreur: this.eventForm.libelleErreur,
      descriptionDetaillee: suggestions.descriptionDetaillee,
      causesPossibles: suggestions.causesPossibles,
      appreciation: suggestions.appreciation,
      evaluation: suggestions.evaluation,
      impact: suggestions.impact,
      preconisation: suggestions.preconisation,
      traitementAction: suggestions.traitementAction,
      actionCorrective: suggestions.actionCorrective,
      impactContinuiteDescription: suggestions.impactContinuiteDescription,
      commentaireEfficacite: suggestions.commentaireEfficacite,
      changementDeclencheDescription: suggestions.changementDeclencheDescription
    };

    const value = suggestionMap[field];
    if (!value) return;

    if (formContext === 'incident') {
      if (!(this.incidentForm as any)[field]) {
        (this.incidentForm as any)[field] = value;
      }
      return;
    }

    if (!(this.eventForm as any)[field]) {
      (this.eventForm as any)[field] = value;
    }
  }

  private expandEventDescription(seed: string): string {
    const cleaned = String(seed || '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
    const context = this.normalizeSearch(`${this.eventForm.libelleErreur} ${cleaned}`);
    if (context.includes('auth')) {
      return `${cleaned}. Des anomalies d’authentification ont été observées sur le service concerné et peuvent perturber l’accès des utilisateurs ou signaler une tentative non autorisée. Les journaux de connexion, les comptes touchés et les adresses sources doivent être analysés afin de confirmer l’origine et le périmètre.`;
    }
    if (context.includes('reseau') || context.includes('indisponibilite')) {
      return `${cleaned}. Une dégradation de la connectivité affecte le périmètre concerné et peut interrompre l’accès aux applications ou services métiers. Les équipements, la supervision et les changements récents doivent être vérifiés avant un rétablissement contrôlé.`;
    }
    return `${cleaned}. L’événement nécessite une analyse technique afin d’identifier son origine, le périmètre affecté et les impacts réels sur le service. Les journaux disponibles, les changements récents et les mesures déjà entreprises doivent être documentés avant la qualification.`;
  }

  private applySmartDateFromTitle(title: string): void {
    if (this.eventForm.dateHeureDetection) return;
    const now = new Date();
    if (title.includes('hier')) {
      now.setDate(now.getDate() - 1);
    }
    const hourMatch = title.match(/(\d{1,2})h/);
    if (hourMatch) {
      now.setHours(parseInt(hourMatch[1], 10), 0, 0, 0);
    }
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    this.eventForm.dateHeureDetection = `${year}-${month}-${day}T${hours}:${mins}`;
  }

  // --- Speech to Text ---
  isDictating: { [field: string]: boolean } = {};
  private activeRecognition: any = null;
  private activeDictationField: string | null = null;

  startDictation(formContext: 'event' | 'incident', field: string, index?: number): void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const message = 'Votre navigateur ne supporte pas la reconnaissance vocale (utilisez Chrome ou Edge).';
      if (formContext === 'event') this.eventFormError.set(message);
      else this.incidentFormError.set(message);
      return;
    }

    const dictationKey = index !== undefined ? `${field}_${index}` : field;

    if (this.activeDictationField === dictationKey && this.activeRecognition) {
      this.activeRecognition.stop();
      this.activeRecognition = null;
      this.activeDictationField = null;
      this.isDictating[dictationKey] = false;
      return;
    }

    if (this.activeRecognition) {
      this.activeRecognition.stop();
    }

    const recognition = new SpeechRecognition();
    recognition.lang = this.getSpeechLocale('dictation');
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.continuous = false;

    this.isDictating[dictationKey] = true;
    this.activeRecognition = recognition;
    this.activeDictationField = dictationKey;

    recognition.onresult = (event: any) => {
      const speechResult = event.results[0][0].transcript?.trim();
      if (!speechResult) return;

      if (formContext === 'incident' && field === 'risqueDescription' && index !== undefined) {
        const current = this.incidentForm.risques[index]?.description || '';
        this.incidentForm.risques[index].description = current ? `${current} ${speechResult}` : speechResult;
      } else {
        const targetForm = formContext === 'event' ? this.eventForm : this.incidentForm;
        const currentVal = (targetForm as any)[field] || '';
        (targetForm as any)[field] = currentVal ? `${currentVal} ${speechResult}` : speechResult;
      }

      if (formContext === 'event') { this.eventFormSuccess.set('Texte dicté ajouté.'); this.eventFormError.set(''); }
      else { this.incidentFormSuccess.set('Texte dicté ajouté.'); this.incidentFormError.set(''); }
      this.cdr.detectChanges();
    };

    recognition.onerror = (event: any) => {
      this.isDictating[dictationKey] = false;
      this.activeRecognition = null;
      this.activeDictationField = null;
      const message = `Erreur micro : ${event.error || 'inconnue'}`;
      if (formContext === 'event') this.eventFormError.set(message);
      else this.incidentFormError.set(message);
      this.cdr.detectChanges();
    };

    recognition.onend = () => {
      this.isDictating[dictationKey] = false;
      this.activeRecognition = null;
      this.activeDictationField = null;
      this.cdr.detectChanges();
    };

    try {
      recognition.start();
    } catch {
      this.isDictating[dictationKey] = false;
      this.activeRecognition = null;
      this.activeDictationField = null;
      const message = 'Impossible de démarrer le micro. Réessayez.';
      if (formContext === 'event') this.eventFormError.set(message);
      else this.incidentFormError.set(message);
    }
  }
}
