package com.example.demo.service;

import com.example.demo.entity.Incident;
import com.example.demo.repository.IncidentRepository;
import com.example.demo.repository.EvenementRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class IncidentService {

    private final IncidentRepository incidentRepository;
    private final EvenementRepository evenementRepository;
    private final AuditLogService auditLogService;

    public List<Incident> getAllIncidents() {
        return incidentRepository.findAll();
    }

    public Optional<Incident> getIncidentById(Long id) {
        return incidentRepository.findById(id);
    }

    public Incident createIncident(Incident incident, String username) {
        if (incident.getEvenement() != null && incident.getEvenement().getId() != null) {
            Long eventId = incident.getEvenement().getId();
            var existingIncidents = incidentRepository.findByEvenementId(eventId);
            if (!existingIncidents.isEmpty()) {
                return existingIncidents.get(0);
            }
            evenementRepository.findById(eventId).ifPresent(incident::setEvenement);
        }
        if (incident.getRisques() != null) {
            incident.getRisques().forEach(r -> r.setIncident(incident));
        }
        refreshDerivedDurations(incident);
        Incident saved = incidentRepository.save(incident);
        auditLogService.logAction(username, "Création de l'Incident N° " + saved.getId() + " lié à l'Événement N° " + (saved.getEvenement() != null ? saved.getEvenement().getId() : "null"));
        return saved;
    }

    public Optional<Incident> updateIncident(Long id, Incident details, String username) {
        return incidentRepository.findById(id).map(existing -> {
            boolean wasClosedNow = "Clôturé".equalsIgnoreCase(details.getTraitementEtat()) && !"Clôturé".equalsIgnoreCase(existing.getTraitementEtat());
            
            existing.setTypesIncident(details.getTypesIncident());
            existing.setNiveauImpact(details.getNiveauImpact());
            existing.setDureeIndisponibilite(details.getDureeIndisponibilite());
            
            // Attenuation
            existing.setMesureActionNumero(details.getMesureActionNumero());
            existing.setMesureAction(details.getMesureAction());
            existing.setMesureResponsable(details.getMesureResponsable());
            existing.setMesureDelai(details.getMesureDelai());
            existing.setMesureEtat(details.getMesureEtat());
            existing.setMesureDDT(details.getMesureDDT());
            existing.setMesureDateCloture(details.getMesureDateCloture());
            existing.setMesureHeureCloture(details.getMesureHeureCloture());
            existing.setDureeAttenuation(details.getDureeAttenuation());
            existing.setHeureAttenuation(details.getHeureAttenuation());

            // Traitement
            existing.setTraitementAction(details.getTraitementAction());
            existing.setTraitementDDT(details.getTraitementDDT());
            existing.setTraitementHDT(details.getTraitementHDT());
            existing.setTraitementResponsable(details.getTraitementResponsable());
            existing.setTraitementEtat(details.getTraitementEtat());
            existing.setTraitementDateCloture(details.getTraitementDateCloture());
            existing.setTraitementHeureCloture(details.getTraitementHeureCloture());
            existing.setDureeTraitement(details.getDureeTraitement());
            existing.setHeureTraitement(details.getHeureTraitement());

            // Correction
            existing.setPreconisation(details.getPreconisation());
            existing.setActionCorrective(details.getActionCorrective());
            existing.setCorrectiveResponsable(details.getCorrectiveResponsable());
            existing.setCorrectiveDateDebut(details.getCorrectiveDateDebut());
            existing.setCorrectiveDateCloture(details.getCorrectiveDateCloture());
            existing.setDateMesureEfficacite(details.getDateMesureEfficacite());
            existing.setEfficacite(details.getEfficacite());
            existing.setCommentaireEfficacite(details.getCommentaireEfficacite());

            // Details, PCA and risks
            existing.setHasRisquesAssocies(details.getHasRisquesAssocies());
            existing.setImpactContinuite(details.getImpactContinuite());
            existing.setImpactContinuiteDescription(details.getImpactContinuiteDescription());
            existing.setCapitalisation(details.getCapitalisation());

            existing.setEvenementsSimilaires(details.getEvenementsSimilaires());
            existing.setEvenementsDetailsDescription(details.getEvenementsDetailsDescription());
            existing.setChangementDeclenche(details.getChangementDeclenche());
            existing.setChangementDeclencheDescription(details.getChangementDeclencheDescription());
            existing.setMiseAJourPcaNecessaire(details.getMiseAJourPcaNecessaire());
            existing.setReferencePca(details.getReferencePca());

            if (details.getRisques() == null || details.getRisques().isEmpty()) {
                existing.getRisques().clear();
            } else {
                List<com.example.demo.entity.Risque> current = existing.getRisques();
                current.removeIf(r -> details.getRisques().stream().noneMatch(dr -> dr.getId() != null && dr.getId().equals(r.getId())));
                for (com.example.demo.entity.Risque newOrUpdated : details.getRisques()) {
                    if (newOrUpdated.getId() == null) {
                        newOrUpdated.setIncident(existing);
                        current.add(newOrUpdated);
                    } else {
                        current.stream().filter(r -> r.getId().equals(newOrUpdated.getId())).findFirst().ifPresent(r -> {
                            r.setReference(newOrUpdated.getReference());
                            r.setDescription(newOrUpdated.getDescription());
                        });
                    }
                }
            }

            existing.setRisquesAMettreAJour(details.getRisquesAMettreAJour());
            existing.setRisquesMiseAJour(details.getRisquesMiseAJour());
            existing.setRisquesMiseAJourDescription(details.getRisquesMiseAJourDescription());

            // Incident tracking file metadata
            existing.setSuiviEdition(details.getSuiviEdition());
            existing.setSuiviDate(details.getSuiviDate());
            existing.setSuiviAuteur(details.getSuiviAuteur());
            existing.setSuiviCommentaires(details.getSuiviCommentaires());

            // Associated Evenement
            if (details.getEvenement() != null && details.getEvenement().getId() != null) {
                evenementRepository.findById(details.getEvenement().getId())
                    .ifPresent(existing::setEvenement);
            } else {
                existing.setEvenement(null);
            }

            refreshDerivedDurations(existing);
            Incident saved = incidentRepository.save(existing);
            if (wasClosedNow) {
                auditLogService.logAction(username, "Incident N° " + saved.getId() + " Clôturé.");
            } else {
                auditLogService.logAction(username, "Mise à jour de l'Incident N° " + saved.getId());
            }
            return saved;
        });
    }

    public boolean deleteIncident(Long id, String username) {
        return incidentRepository.findById(id).map(existing -> {
            incidentRepository.delete(existing);
            auditLogService.logAction(username, "Suppression de l'Incident N° " + id);
            return true;
        }).orElse(false);
    }
    private void refreshDerivedDurations(Incident incident) {
        if (incident.getEvenement() == null || incident.getEvenement().getDateHeureDetection() == null) {
            return;
        }

        LocalDateTime start = incident.getEvenement().getDateHeureDetection();
        LocalDateTime end = firstClosureDateTime(incident);
        if (end == null) {
            // Un incident ouvert a tout de même une durée d'indisponibilité :
            // elle est calculée jusqu'au moment de la sauvegarde.
            end = LocalDateTime.now();
        }
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
