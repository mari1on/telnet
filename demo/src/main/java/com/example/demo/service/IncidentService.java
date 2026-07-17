package com.example.demo.service;

import com.example.demo.entity.Evenement;
import com.example.demo.entity.Incident;
import com.example.demo.entity.Risque;
import com.example.demo.repository.EvenementRepository;
import com.example.demo.repository.IncidentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;

@Service
public class IncidentService {

    private final IncidentRepository incidentRepository;
    private final EvenementRepository evenementRepository;
    private final AuditLogService auditLogService;

    public IncidentService(IncidentRepository incidentRepository,
                           EvenementRepository evenementRepository,
                           AuditLogService auditLogService) {
        this.incidentRepository = incidentRepository;
        this.evenementRepository = evenementRepository;
        this.auditLogService = auditLogService;
    }

    public List<Incident> getAllIncidents() {
        return incidentRepository.findAll();
    }

    public Optional<Incident> getIncidentById(Long id) {
        return incidentRepository.findById(id);
    }

    /**
     * Enregistre un plan d'incident de façon idempotente : si la qualification a
     * déjà créé un incident vide pour l'événement, ce plan est mis à jour au lieu
     * de tenter de créer un doublon.
     */
    @Transactional
    public Incident createIncident(Incident incoming, String username) {
        Evenement event = requireManagedEvent(incoming);
        Incident target = incidentRepository.findByEvenementId(event.getId())
                .stream()
                .findFirst()
                .orElseGet(Incident::new);
        boolean creation = target.getId() == null;

        copyEditableFields(target, incoming);
        target.setEvenement(event);
        replaceRisks(target, incoming.getRisques());
        refreshDerivedDurations(target);

        Incident saved = incidentRepository.saveAndFlush(target);
        safeAudit(username, creation
                ? "Création de l'Incident N° " + saved.getId() + " lié à l'Événement N° " + event.getId()
                : "Mise à jour de l'Incident N° " + saved.getId() + " lié à l'Événement N° " + event.getId());
        return saved;
    }

    @Transactional
    public Optional<Incident> updateIncident(Long id, Incident incoming, String username) {
        return incidentRepository.findById(id).map(target -> {
            boolean wasClosedNow = "Clôturé".equalsIgnoreCase(incoming.getTraitementEtat())
                    && !"Clôturé".equalsIgnoreCase(target.getTraitementEtat());

            copyEditableFields(target, incoming);
            if (incoming.getEvenement() != null && incoming.getEvenement().getId() != null) {
                target.setEvenement(evenementRepository.findById(incoming.getEvenement().getId())
                        .orElseThrow(() -> new IllegalArgumentException(
                                "L'événement rattaché à l'incident est introuvable.")));
            }
            replaceRisks(target, incoming.getRisques());
            refreshDerivedDurations(target);

            Incident saved = incidentRepository.saveAndFlush(target);
            safeAudit(username, wasClosedNow
                    ? "Incident N° " + saved.getId() + " Clôturé."
                    : "Mise à jour de l'Incident N° " + saved.getId());
            return saved;
        });
    }

    @Transactional
    public boolean deleteIncident(Long id, String username) {
        return incidentRepository.findById(id).map(existing -> {
            Evenement linkedEvent = existing.getEvenement();
            if (existing.getRisques() != null) {
                existing.getRisques().clear();
            }
            existing.setEvenement(null);
            incidentRepository.saveAndFlush(existing);
            incidentRepository.delete(existing);
            incidentRepository.flush();

            if (linkedEvent != null) {
                linkedEvent.setQualification("NON_QUALIFIE");
                linkedEvent.setQualifiePar(null);
                evenementRepository.save(linkedEvent);
            }

            safeAudit(username, "Suppression de l'Incident N° " + id);
            return true;
        }).orElse(false);
    }

    private Evenement requireManagedEvent(Incident incoming) {
        if (incoming == null || incoming.getEvenement() == null || incoming.getEvenement().getId() == null) {
            throw new IllegalArgumentException("Sélectionnez l'événement rattaché à l'incident.");
        }
        return evenementRepository.findById(incoming.getEvenement().getId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "L'événement rattaché à l'incident est introuvable."));
    }

    /**
     * Copie uniquement les données éditables. Les textes courts sont limités à
     * la taille d'une colonne VARCHAR classique afin qu'une réponse IA trop
     * longue ne bloque pas toute la fiche.
     */
    private void copyEditableFields(Incident target, Incident source) {
        target.setTypesIncident(normalizeTypes(source.getTypesIncident()));
        target.setNiveauImpact(shortText(source.getNiveauImpact(), 240));
        target.setDureeIndisponibilite(shortText(source.getDureeIndisponibilite(), 240));

        target.setMesureActionNumero(shortText(source.getMesureActionNumero(), 240));
        target.setMesureAction(text(source.getMesureAction()));
        target.setMesureResponsable(shortText(source.getMesureResponsable(), 240));
        target.setMesureDelai(shortText(source.getMesureDelai(), 240));
        target.setMesureEtat(shortText(source.getMesureEtat(), 240));
        target.setMesureDDT(source.getMesureDDT());
        target.setDureeAttenuation(shortText(source.getDureeAttenuation(), 240));
        target.setHeureAttenuation(shortText(source.getHeureAttenuation(), 240));
        target.setMesureDateCloture(source.getMesureDateCloture());
        target.setMesureHeureCloture(source.getMesureHeureCloture());

        target.setTraitementAction(text(source.getTraitementAction()));
        target.setTraitementDDT(source.getTraitementDDT());
        target.setTraitementHDT(source.getTraitementHDT());
        target.setTraitementResponsable(shortText(source.getTraitementResponsable(), 240));
        target.setTraitementEtat(shortText(source.getTraitementEtat(), 240));
        target.setTraitementDateCloture(source.getTraitementDateCloture());
        target.setTraitementHeureCloture(source.getTraitementHeureCloture());
        target.setDureeTraitement(shortText(source.getDureeTraitement(), 240));
        target.setHeureTraitement(shortText(source.getHeureTraitement(), 240));

        target.setPreconisation(text(source.getPreconisation()));
        target.setActionCorrective(text(source.getActionCorrective()));
        target.setCorrectiveResponsable(shortText(source.getCorrectiveResponsable(), 240));
        target.setCorrectiveDateDebut(source.getCorrectiveDateDebut());
        target.setCorrectiveDateCloture(source.getCorrectiveDateCloture());
        target.setDateMesureEfficacite(source.getDateMesureEfficacite());
        target.setEfficacite(shortText(source.getEfficacite(), 240));
        target.setCommentaireEfficacite(text(source.getCommentaireEfficacite()));

        target.setHasRisquesAssocies(Boolean.TRUE.equals(source.getHasRisquesAssocies()));
        target.setImpactContinuite(Boolean.TRUE.equals(source.getImpactContinuite()));
        target.setImpactContinuiteDescription(text(source.getImpactContinuiteDescription()));
        target.setCapitalisation(Boolean.TRUE.equals(source.getCapitalisation()));
        target.setEvenementsSimilaires(shortText(source.getEvenementsSimilaires(), 240));
        target.setEvenementsDetailsDescription(text(source.getEvenementsDetailsDescription()));
        target.setChangementDeclenche(Boolean.TRUE.equals(source.getChangementDeclenche()));
        target.setChangementDeclencheDescription(text(source.getChangementDeclencheDescription()));
        target.setMiseAJourPcaNecessaire(Boolean.TRUE.equals(source.getMiseAJourPcaNecessaire()));
        target.setReferencePca(shortText(source.getReferencePca(), 240));
        target.setRisquesAMettreAJour(Boolean.TRUE.equals(source.getRisquesAMettreAJour()));
        target.setRisquesMiseAJour(text(source.getRisquesMiseAJour()));
        target.setRisquesMiseAJourDescription(text(source.getRisquesMiseAJourDescription()));
        target.setSuiviEdition(shortText(source.getSuiviEdition(), 240));
        target.setSuiviDate(source.getSuiviDate());
        target.setSuiviAuteur(shortText(source.getSuiviAuteur(), 240));
        target.setSuiviCommentaires(text(source.getSuiviCommentaires()));
    }

    /**
     * Les identifiants de risques reçus du navigateur ou du modèle IA ne sont
     * jamais réutilisés. On reconstruit des entités enfants propres, ce qui évite
     * l'erreur Hibernate « detached entity passed to persist ».
     */
    private void replaceRisks(Incident target, List<Risque> incomingRisks) {
        List<Risque> cleanRisks = new ArrayList<>();
        if (incomingRisks != null) {
            for (int index = 0; index < incomingRisks.size(); index++) {
                Risque incoming = incomingRisks.get(index);
                if (incoming == null || incoming.getDescription() == null || incoming.getDescription().isBlank()) {
                    throw new IllegalArgumentException(
                            "La description du risque n°" + (index + 1) + " est obligatoire.");
                }
                Risque risk = new Risque();
                risk.setReference(shortText(incoming.getReference(), 240));
                risk.setDescription(text(incoming.getDescription()));
                risk.setIncident(target);
                cleanRisks.add(risk);
            }
        }

        if (target.getRisques() == null) {
            target.setRisques(new ArrayList<>());
        } else {
            target.getRisques().clear();
        }
        target.getRisques().addAll(cleanRisks);
        target.setHasRisquesAssocies(!cleanRisks.isEmpty() || Boolean.TRUE.equals(target.getHasRisquesAssocies()));
    }

    private List<String> normalizeTypes(List<String> source) {
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        if (source != null) {
            for (String value : source) {
                String normalized = shortText(value, 240);
                if (normalized != null) unique.add(normalized);
            }
        }
        if (unique.isEmpty()) unique.add("Autre");
        return new ArrayList<>(unique);
    }

    private String text(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String shortText(String value, int maximum) {
        String normalized = text(value);
        if (normalized == null) return null;
        return normalized.length() <= maximum ? normalized : normalized.substring(0, maximum);
    }

    private void safeAudit(String username, String action) {
        try {
            auditLogService.logAction(username, action);
        } catch (RuntimeException ignored) {
            // L'échec du journal d'audit ne doit pas annuler l'enregistrement métier.
        }
    }

    private void refreshDerivedDurations(Incident incident) {
        if (incident.getEvenement() == null || incident.getEvenement().getDateHeureDetection() == null) {
            return;
        }

        LocalDateTime start = incident.getEvenement().getDateHeureDetection();
        LocalDateTime end = firstClosureDateTime(incident);
        if (end == null) end = LocalDateTime.now();
        if (!end.isBefore(start)) {
            incident.setDureeIndisponibilite(formatDuration(Duration.between(start, end)));
        }

        if (incident.getTraitementDDT() != null && incident.getTraitementHDT() != null) {
            LocalDateTime treatmentStart = LocalDateTime.of(
                    incident.getTraitementDDT(), incident.getTraitementHDT());
            LocalDateTime treatmentEnd = incident.getTraitementDateCloture() != null
                    && incident.getTraitementHeureCloture() != null
                    ? LocalDateTime.of(incident.getTraitementDateCloture(), incident.getTraitementHeureCloture())
                    : null;
            if (treatmentEnd != null && !treatmentEnd.isBefore(treatmentStart)) {
                incident.setDureeTraitement(formatDuration(Duration.between(treatmentStart, treatmentEnd)));
            }
        }
    }

    private LocalDateTime firstClosureDateTime(Incident incident) {
        LocalDateTime mitigationClosure = incident.getMesureDateCloture() != null
                && incident.getMesureHeureCloture() != null
                ? LocalDateTime.of(incident.getMesureDateCloture(), incident.getMesureHeureCloture())
                : null;
        LocalDateTime treatmentClosure = incident.getTraitementDateCloture() != null
                && incident.getTraitementHeureCloture() != null
                ? LocalDateTime.of(incident.getTraitementDateCloture(), incident.getTraitementHeureCloture())
                : null;

        if (mitigationClosure == null) return treatmentClosure;
        if (treatmentClosure == null) return mitigationClosure;
        return mitigationClosure.isBefore(treatmentClosure) ? mitigationClosure : treatmentClosure;
    }

    private String formatDuration(Duration duration) {
        long totalMinutes = Math.max(0, duration.toMinutes());
        long days = totalMinutes / 1440;
        long hours = (totalMinutes % 1440) / 60;
        long minutes = totalMinutes % 60;
        StringBuilder result = new StringBuilder();
        if (days > 0) result.append(days).append("j ");
        if (hours > 0) result.append(hours).append("h ");
        if (minutes > 0 || result.isEmpty()) result.append(minutes).append("m");
        return result.toString().trim();
    }
}
