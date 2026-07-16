package com.example.demo.service;

import com.example.demo.entity.Evenement;
import com.example.demo.entity.Incident;
import com.example.demo.repository.EvenementRepository;
import com.example.demo.repository.IncidentRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
public class EvenementService {

    private final EvenementRepository evenementRepository;
    private final IncidentRepository incidentRepository;
    private final AuditLogService auditLogService;
    private final EmailService emailService;

    public EvenementService(
            EvenementRepository evenementRepository,
            IncidentRepository incidentRepository,
            AuditLogService auditLogService,
            EmailService emailService
    ) {
        this.evenementRepository = evenementRepository;
        this.incidentRepository = incidentRepository;
        this.auditLogService = auditLogService;
        this.emailService = emailService;
    }

    public List<Evenement> getAllEvenements(String username, boolean isRssi) {
        return isRssi ? evenementRepository.findAll() : evenementRepository.findByDeclarePar(username);
    }

    public Optional<Evenement> getEvenementById(Long id) {
        return evenementRepository.findById(id);
    }

    public Evenement createEvenement(Evenement evenement, String username) {
        if (evenement.getQualification() == null) evenement.setQualification("NON_QUALIFIE");
        if (evenement.getEnvoyeAuRssi() == null) evenement.setEnvoyeAuRssi(false);

        evenement.setReferenceEvenement(requireUniqueEventReference(evenement.getReferenceEvenement(), null));
        evenement.setIdTicket(requireUniqueTicket(evenement.getIdTicket(), null));
        evenement.setCodeErreur(requireUniqueErrorCode(evenement.getCodeErreur(), null));
        evenement.setDeclarePar(username);

        Evenement saved = evenementRepository.save(evenement);
        auditLogService.logAction(username,
                "Création Événement N° " + saved.getId() + " [" + saved.getIdTicket() + "] '" + saved.getLibelleErreur() + "'");
        return saved;
    }

    public Evenement sendToRssi(Long id, String username, boolean isRssi) {
        Evenement event = evenementRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Événement introuvable."));

        if (!isRssi && !username.equals(event.getDeclarePar())) {
            throw new IllegalArgumentException("Vous n'êtes pas autorisé à envoyer cet événement au RSSI.");
        }
        if (Boolean.TRUE.equals(event.getEnvoyeAuRssi())) {
            throw new IllegalStateException("Cet événement a déjà été envoyé au RSSI.");
        }
        if (!isEventComplete(event)) {
            throw new IllegalStateException("Veuillez remplir tous les champs obligatoires avant l'envoi au RSSI.");
        }

        emailService.notifyRssiNewEvent(event);
        event.setEnvoyeAuRssi(true);
        event.setDateEnvoiRssi(LocalDateTime.now());
        Evenement saved = evenementRepository.save(event);
        auditLogService.logAction(username,
                "Envoi RSSI de l'Événement N° " + saved.getId() + " '" + saved.getLibelleErreur() + "'");
        return saved;
    }

    public Optional<Evenement> updateEvenement(Long id, Evenement details, String username) {
        return evenementRepository.findById(id).map(existing -> {
            boolean wasQualified = details.getQualification() != null
                    && !details.getQualification().equals(existing.getQualification());

            existing.setReferenceEvenement(requireUniqueEventReference(
                    details.getReferenceEvenement() == null || details.getReferenceEvenement().isBlank()
                            ? existing.getReferenceEvenement()
                            : details.getReferenceEvenement(),
                    id
            ));
            existing.setDescriptionDetaillee(details.getDescriptionDetaillee());
            existing.setDateHeureDetection(details.getDateHeureDetection());
            existing.setDetecteParSource(details.getDetecteParSource());
            existing.setIdTicket(requireUniqueTicket(details.getIdTicket(), id));
            existing.setCommentaireSource(details.getCommentaireSource());
            existing.setNatureEvenement(details.getNatureEvenement());
            existing.setServiceOsAppli(details.getServiceOsAppli());
            existing.setEquipementHardware(details.getEquipementHardware());
            existing.setLibelleErreur(details.getLibelleErreur());
            existing.setCodeErreur(requireUniqueErrorCode(details.getCodeErreur(), id));
            existing.setCausesPossibles(details.getCausesPossibles());
            existing.setEtat(details.getEtat());
            existing.setAppreciation(details.getAppreciation());
            existing.setEvaluation(details.getEvaluation());
            existing.setImpact(details.getImpact());
            existing.setImpactNiveau(details.getImpactNiveau());
            existing.setImpactMineur(details.getImpactMineur());
            existing.setImpactCommentaire(details.getImpactCommentaire());
            existing.setTypeActif(details.getTypeActif());
            existing.setActifAffecte(details.getActifAffecte());
            boolean qualificationSubmitted = hasAnyQualificationImpact(details);
            if (qualificationSubmitted) {
                validateQualificationImpacts(details);
                existing.setImpactConfidentialite(details.getImpactConfidentialite());
                existing.setCommentaireConfidentialite(details.getCommentaireConfidentialite());
                existing.setImpactIntegrite(details.getImpactIntegrite());
                existing.setCommentaireIntegrite(details.getCommentaireIntegrite());
                existing.setImpactDisponibilite(details.getImpactDisponibilite());
                existing.setCommentaireDisponibilite(details.getCommentaireDisponibilite());
                existing.setQualification(classifyFromCid(details));
                existing.setQualifiePar(username);
                wasQualified = true;
            }

            Evenement saved = evenementRepository.save(existing);
            auditLogService.logAction(username, wasQualified
                    ? "Qualification de l'Événement N° " + saved.getId() + " : " + saved.getQualification()
                    : "Mise à jour de l'Événement N° " + saved.getId());
            return saved;
        });
    }

    public Optional<Evenement> qualifyEvenement(
            Long id,
            String typeActif,
            String actifAffecte,
            String impactConfidentialite,
            String impactIntegrite,
            String impactDisponibilite,
            String commentaireConfidentialite,
            String commentaireIntegrite,
            String commentaireDisponibilite,
            String username
    ) {
        Evenement qualification = new Evenement();
        qualification.setImpactConfidentialite(impactConfidentialite);
        qualification.setImpactIntegrite(impactIntegrite);
        qualification.setImpactDisponibilite(impactDisponibilite);
        validateQualificationImpacts(qualification);

        return evenementRepository.findById(id).map(existing -> {
            existing.setTypeActif(typeActif == null ? existing.getTypeActif() : typeActif.trim());
            existing.setActifAffecte(actifAffecte == null ? existing.getActifAffecte() : actifAffecte.trim());
            existing.setImpactConfidentialite(impactConfidentialite);
            existing.setImpactIntegrite(impactIntegrite);
            existing.setImpactDisponibilite(impactDisponibilite);
            existing.setCommentaireConfidentialite(commentaireConfidentialite == null ? "" : commentaireConfidentialite.trim());
            existing.setCommentaireIntegrite(commentaireIntegrite == null ? "" : commentaireIntegrite.trim());
            existing.setCommentaireDisponibilite(commentaireDisponibilite == null ? "" : commentaireDisponibilite.trim());
            existing.setQualification(classifyFromCid(qualification));
            existing.setQualifiePar(username);
            Evenement saved = evenementRepository.save(existing);
            auditLogService.logAction(username,
                    "Qualification de l'Événement N° " + saved.getId() + " : " + saved.getQualification());
            return saved;
        });
    }

    public boolean deleteEvenement(Long id, String username) {
        return evenementRepository.findById(id).map(existing -> {
            List<Incident> relatedIncidents = incidentRepository.findByEvenementId(id);
            for (Incident incident : relatedIncidents) {
                incidentRepository.delete(incident);
                auditLogService.logAction(username,
                        "Suppression automatique de l'Incident N° " + incident.getId() + " lié à l'événement");
            }
            evenementRepository.delete(existing);
            auditLogService.logAction(username, "Suppression de l'Événement N° " + id);
            return true;
        }).orElse(false);
    }

    private String requireUniqueEventReference(String rawValue, Long currentId) {
        String candidate = rawValue == null ? "" : rawValue.trim().toUpperCase();
        if (candidate.isBlank()) candidate = generateEventReference();

        boolean duplicate = currentId == null
                ? evenementRepository.existsByReferenceEvenementIgnoreCase(candidate)
                : evenementRepository.existsByReferenceEvenementIgnoreCaseAndIdNot(candidate, currentId);
        while (duplicate) {
            candidate = generateEventReference();
            duplicate = currentId == null
                    ? evenementRepository.existsByReferenceEvenementIgnoreCase(candidate)
                    : evenementRepository.existsByReferenceEvenementIgnoreCaseAndIdNot(candidate, currentId);
        }
        return candidate;
    }

    private String generateEventReference() {
        String date = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase();
        return "EV-" + date + "-" + suffix;
    }

    private boolean hasAnyQualificationImpact(Evenement details) {
        String requested = details.getQualification();
        if ("INCIDENT".equals(requested) || "NON_INCIDENT".equals(requested)) return true;
        Set<String> allowed = Set.of("Mineur", "Majeur", "Critique");
        return allowed.contains(details.getImpactConfidentialite())
                && allowed.contains(details.getImpactIntegrite())
                && allowed.contains(details.getImpactDisponibilite());
    }

    private void validateQualificationImpacts(Evenement details) {
        Set<String> allowed = Set.of("Mineur", "Majeur", "Critique");
        if (!allowed.contains(details.getImpactConfidentialite())
                || !allowed.contains(details.getImpactIntegrite())
                || !allowed.contains(details.getImpactDisponibilite())) {
            throw new IllegalArgumentException(
                    "Les trois impacts CID doivent être renseignés avec Mineur, Majeur ou Critique."
            );
        }
    }

    private String classifyFromCid(Evenement details) {
        boolean critical = "Critique".equals(details.getImpactConfidentialite())
                || "Critique".equals(details.getImpactIntegrite())
                || "Critique".equals(details.getImpactDisponibilite());
        return critical ? "INCIDENT" : "NON_INCIDENT";
    }

    private String requireUniqueTicket(String rawValue, Long currentId) {
        String value = normalizeIdentifier(rawValue, "L'ID Ticket est obligatoire.");
        boolean duplicate = currentId == null
                ? evenementRepository.existsByIdTicketIgnoreCase(value)
                : evenementRepository.existsByIdTicketIgnoreCaseAndIdNot(value, currentId);
        if (duplicate) throw new IllegalArgumentException("Cet ID Ticket existe déjà. Saisissez une valeur unique.");
        return value;
    }

    private String requireUniqueErrorCode(String rawValue, Long currentId) {
        String value = normalizeIdentifier(rawValue, "Le code erreur est obligatoire.");
        boolean duplicate = currentId == null
                ? evenementRepository.existsByCodeErreurIgnoreCase(value)
                : evenementRepository.existsByCodeErreurIgnoreCaseAndIdNot(value, currentId);
        if (duplicate) throw new IllegalArgumentException("Ce code erreur existe déjà. Saisissez une valeur unique.");
        return value;
    }

    private String normalizeIdentifier(String rawValue, String emptyMessage) {
        if (rawValue == null || rawValue.isBlank()) throw new IllegalArgumentException(emptyMessage);
        String value = rawValue.trim();
        if (value.length() > 120) throw new IllegalArgumentException("L'identifiant ne doit pas dépasser 120 caractères.");
        return value;
    }

    private boolean isEventComplete(Evenement event) {
        return isFilled(event.getLibelleErreur())
                && isFilled(event.getDescriptionDetaillee())
                && event.getDateHeureDetection() != null
                && isFilled(event.getDetecteParSource())
                && isFilled(event.getIdTicket())
                && isFilled(event.getCodeErreur())
                && isFilled(event.getCausesPossibles())
                && isFilled(event.getEtat())
                && isFilled(event.getNatureEvenement());
    }

    private boolean isFilled(String value) {
        return value != null && !value.isBlank();
    }
}
