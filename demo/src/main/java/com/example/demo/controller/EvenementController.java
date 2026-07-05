package com.example.demo.controller;

import com.example.demo.entity.Evenement;
import com.example.demo.service.EvenementService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/evenements")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class EvenementController {

    private final EvenementService evenementService;

    private String getUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.isAuthenticated()) {
            return authentication.getName();
        }
        return "UNKNOWN";
    }

    private boolean isRssi() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.isAuthenticated()) {
            for (GrantedAuthority authority : authentication.getAuthorities()) {
                String role = authority.getAuthority();
                if (role.equals("RSSI") || role.equals("ROLE_ADMIN") || role.equals("ADMIN")) {
                    return true;
                }
            }
        }
        return false;
    }

    @GetMapping
    public List<Evenement> getAllEvenements() {
        return evenementService.getAllEvenements(getUsername(), isRssi());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Evenement> getEvenementById(@PathVariable Long id) {
        return evenementService.getEvenementById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<Evenement> createEvenement(@RequestBody Evenement evenement) {
        return ResponseEntity.ok(evenementService.createEvenement(evenement, getUsername()));
    }

    @PutMapping("/{id}")
    public ResponseEntity<Evenement> updateEvenement(@PathVariable Long id, @RequestBody Evenement details) {
        return evenementService.updateEvenement(id, details, getUsername())
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/notify-rssi")
    public ResponseEntity<?> notifyRssi(@PathVariable Long id) {
        try {
            Evenement updated = evenementService.sendToRssi(id, getUsername(), isRssi());
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException | IllegalStateException ex) {
            return ResponseEntity.badRequest().body(Map.of("message", ex.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEvenement(@PathVariable Long id) {
        if (evenementService.deleteEvenement(id, getUsername())) {
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.notFound().build();
    }
}
