package com.example.demo.service;

import com.example.demo.entity.Evenement;
import com.example.demo.entity.Incident;
import com.example.demo.repository.EvenementRepository;
import com.example.demo.repository.IncidentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class EvenementService {

    private final EvenementRepository evenementRepository;
    private final IncidentRepository incidentRepository;
    private final AuditLogService auditLogService;
    private final EmailService emailService;

    public List<Evenement> getAllEvenements(String username, boolean isRssi) {
        if (isRssi) {
            return evenementRepository.findAll();
        }
        return evenementRepository.findByDeclarePar(username);
    }

    public Optional<Evenement> getEvenementById(Long id) {
        return evenementRepository.findById(id);
    }

    public Evenement createEvenement(Evenement evenement, String username) {
        if (evenement.getQualification() == null) {
            evenement.setQualification("NON_QUALIFIE");
        }
        if (evenement.getEnvoyeAuRssi() == null) {
            evenement.setEnvoyeAuRssi(false);
        }
        evenement.setDeclarePar(username);
        Evenement saved = evenementRepository.save(evenement);
        auditLogService.logAction(username, "Création Événement N° " + saved.getId() + " '" + saved.getLibelleErreur() + "'");
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
            throw new IllegalStateException("Veuillez remplir tous les champs du formulaire avant l'envoi au RSSI.");
        }

        emailService.notifyRssiNewEvent(event);
        event.setEnvoyeAuRssi(true);
        event.setDateEnvoiRssi(LocalDateTime.now());
        Evenement saved = evenementRepository.save(event);
        auditLogService.logAction(username, "Envoi RSSI de l'Événement N° " + saved.getId() + " '" + saved.getLibelleErreur() + "'");
        return saved;
    }

    public Optional<Evenement> updateEvenement(Long id, Evenement details, String username) {
        return evenementRepository.findById(id).map(existing -> {
            boolean wasQualified = details.getQualification() != null && !details.getQualification().equals(existing.getQualification());

            existing.setDescriptionDetaillee(details.getDescriptionDetaillee());
            existing.setDateHeureDetection(details.getDateHeureDetection());
            existing.setDetecteParSource(details.getDetecteParSource());
            existing.setIdTicket(details.getIdTicket());
            existing.setCommentaireSource(details.getCommentaireSource());
            existing.setNatureEvenement(details.getNatureEvenement());
            existing.setServiceOsAppli(details.getServiceOsAppli());
            existing.setEquipementHardware(details.getEquipementHardware());
            existing.setLibelleErreur(details.getLibelleErreur());
            existing.setCodeErreur(details.getCodeErreur());
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

            existing.setImpactConfidentialite(details.getImpactConfidentialite());
            existing.setCommentaireConfidentialite(details.getCommentaireConfidentialite());
            existing.setImpactIntegrite(details.getImpactIntegrite());
            existing.setCommentaireIntegrite(details.getCommentaireIntegrite());
            existing.setImpactDisponibilite(details.getImpactDisponibilite());
            existing.setCommentaireDisponibilite(details.getCommentaireDisponibilite());

            if (wasQualified) {
                existing.setQualification(details.getQualification());
                existing.setQualifiePar(username);
            }

            Evenement saved = evenementRepository.save(existing);

            if (wasQualified) {
                auditLogService.logAction(username, "Qualification de l'Événement N° " + saved.getId() + " : " + saved.getQualification());
            } else {
                auditLogService.logAction(username, "Mise à jour de l'Événement N° " + saved.getId());
            }

            return saved;
        });
    }

    public boolean deleteEvenement(Long id, String username) {
        return evenementRepository.findById(id).map(existing -> {
            List<Incident> relatedIncidents = incidentRepository.findByEvenementId(id);
            for (Incident incident : relatedIncidents) {
                incidentRepository.delete(incident);
                auditLogService.logAction(username, "Suppression automatique de l'Incident N° " + incident.getId() + " lié à l'événement");
            }
            evenementRepository.delete(existing);
            auditLogService.logAction(username, "Suppression de l'Événement N° " + id);
            return true;
        }).orElse(false);
    }

    private boolean isEventComplete(Evenement event) {
        return isFilled(event.getLibelleErreur())
                && isFilled(event.getDescriptionDetaillee())
                && event.getDateHeureDetection() != null
                && isFilled(event.getDetecteParSource())
                && isFilled(event.getCausesPossibles())
                && isFilled(event.getEtat())
                && isFilled(event.getNatureEvenement());
    }

    private boolean isFilled(String value) {
        return value != null && !value.isBlank();
    }
}
