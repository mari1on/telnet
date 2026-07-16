package com.example.demo.controller;

import com.example.demo.dto.AuthDTOs.*;
import com.example.demo.entity.User;
import com.example.demo.repository.UserRepository;
import com.example.demo.security.jwt.JwtUtils;
import com.example.demo.security.services.UserDetailsImpl;
import com.example.demo.service.PasswordResetService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.dao.DataIntegrityViolationException;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final UserRepository userRepository;
    private final PasswordEncoder encoder;
    private final JwtUtils jwtUtils;
    private final PasswordResetService passwordResetService;

    public AuthController(AuthenticationManager authenticationManager,
                          UserRepository userRepository,
                          PasswordEncoder encoder,
                          JwtUtils jwtUtils,
                          PasswordResetService passwordResetService) {
        this.authenticationManager = authenticationManager;
        this.userRepository = userRepository;
        this.encoder = encoder;
        this.jwtUtils = jwtUtils;
        this.passwordResetService = passwordResetService;
    }

    @PostMapping("/signin")
    public ResponseEntity<?> authenticateUser(@RequestBody LoginRequest loginRequest) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(loginRequest.getUsername(), loginRequest.getPassword()));

        SecurityContextHolder.getContext().setAuthentication(authentication);
        String jwt = jwtUtils.generateJwtToken(authentication);

        UserDetailsImpl userDetails = (UserDetailsImpl) authentication.getPrincipal();

        return ResponseEntity.ok(new JwtResponse(jwt,
                userDetails.getId(),
                userDetails.getUsername(),
                userDetails.getEmail(),
                userDetails.getRole()));
    }

    @PostMapping("/signup")
    public ResponseEntity<?> registerUser(@RequestBody SignupRequest signUpRequest) {
        if (userRepository.findByUsername(signUpRequest.getUsername()).isPresent()) {
            return ResponseEntity
                    .badRequest()
                    .body(new MessageResponse("Erreur : Le nom d'utilisateur est déjà pris !"));
        }

        if (userRepository.findByEmail(signUpRequest.getEmail()).isPresent()) {
            return ResponseEntity
                    .badRequest()
                    .body(new MessageResponse("Erreur : L'email est déjà utilisé !"));
        }

        String pwd = signUpRequest.getPassword();
        if (pwd == null || pwd.length() < 8 || !pwd.matches(".*[A-Z].*") || !pwd.matches(".*[a-z].*") || !pwd.matches(".*\\d.*") || !pwd.matches(".*[@$!%*?&].*")) {
            return ResponseEntity
                    .badRequest()
                    .body(new MessageResponse("Erreur : Le mot de passe n'est pas assez sécurisé (8 caractères min, 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial)."));
        }

        // Create new user's account
        User user = User.builder()
                .username(signUpRequest.getUsername())
                .email(signUpRequest.getEmail())
                .password(encoder.encode(signUpRequest.getPassword()))
                .role(signUpRequest.getRole() != null ? signUpRequest.getRole() : "USER")
                .build();

        userRepository.save(user);

        return ResponseEntity.ok(new MessageResponse("Utilisateur enregistré avec succès !"));
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody ForgotPasswordRequest request) {
        if (request == null || request.getIdentifier() == null || request.getIdentifier().isBlank()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Saisissez votre identifiant ou votre adresse email."));
        }
        try {
            passwordResetService.requestReset(request.getIdentifier());
            return ResponseEntity.ok(new MessageResponse(
                    "Si un compte correspond, un code à 6 chiffres a été envoyé par email. Le code expire dans 10 minutes."));
        } catch (IllegalStateException ex) {
            return ResponseEntity.internalServerError().body(new MessageResponse(ex.getMessage()));
        }
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody ResetPasswordRequest request) {
        if (request == null) {
            return ResponseEntity.badRequest().body(new MessageResponse("Données de réinitialisation manquantes."));
        }
        try {
            passwordResetService.resetPassword(
                    request.getIdentifier(),
                    request.getCode(),
                    request.getNewPassword());
            return ResponseEntity.ok(new MessageResponse("Mot de passe réinitialisé. Vous pouvez maintenant vous connecter."));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(new MessageResponse(ex.getMessage()));
        }
    }

    @PutMapping("/profile")
    public ResponseEntity<?> updateProfile(@RequestBody ProfileUpdateRequest request, Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof UserDetailsImpl userDetails)) {
            return ResponseEntity.status(401).body(new MessageResponse("Authentification requise."));
        }

        User user = userRepository.findById(userDetails.getId()).orElse(null);
        if (user == null) {
            return ResponseEntity.notFound().build();
        }

        String username = request.getUsername() != null ? request.getUsername().trim() : user.getUsername();
        String email = request.getEmail() != null ? request.getEmail().trim() : user.getEmail();
        String newPassword = request.getNewPassword();
        boolean emailChanged = !email.equalsIgnoreCase(user.getEmail());
        boolean passwordChanged = newPassword != null && !newPassword.isEmpty();

        if (username.isBlank()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Le nom d'utilisateur ne peut pas être vide."));
        }
        if (!isValidEmail(email)) {
            return ResponseEntity.badRequest().body(new MessageResponse("Veuillez saisir une adresse email valide."));
        }

        if ((emailChanged || passwordChanged)
                && (request.getCurrentPassword() == null
                || !encoder.matches(request.getCurrentPassword(), user.getPassword()))) {
            return ResponseEntity.badRequest().body(new MessageResponse("Le mot de passe actuel est incorrect."));
        }

        if (passwordChanged && !isStrongPassword(newPassword)) {
            return ResponseEntity.badRequest().body(new MessageResponse(
                    "Le nouveau mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial."));
        }

        if (userRepository.findByUsername(username).filter(existing -> !existing.getId().equals(user.getId())).isPresent()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Ce nom d'utilisateur est déjà utilisé."));
        }

        if (userRepository.findByEmail(email).filter(existing -> !existing.getId().equals(user.getId())).isPresent()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Cet email est déjà utilisé."));
        }

        user.setUsername(username);
        user.setEmail(email);
        if (passwordChanged) {
            user.setPassword(encoder.encode(newPassword));
        }

        try {
            User saved = userRepository.save(user);
            UserDetailsImpl refreshedDetails = UserDetailsImpl.build(saved);
            Authentication refreshedAuthentication = new UsernamePasswordAuthenticationToken(
                    refreshedDetails,
                    null,
                    refreshedDetails.getAuthorities());
            String refreshedToken = jwtUtils.generateJwtToken(refreshedAuthentication);

            return ResponseEntity.ok(new JwtResponse(refreshedToken,
                    saved.getId(),
                    saved.getUsername(),
                    saved.getEmail(),
                    saved.getRole()));
        } catch (DataIntegrityViolationException ex) {
            return ResponseEntity.badRequest().body(new MessageResponse("Impossible de mettre à jour le profil : identifiant ou email déjà utilisé."));
        }
    }

    private boolean isValidEmail(String email) {
        return email != null && email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    }

    private boolean isStrongPassword(String password) {
        return password != null
                && password.length() >= 8
                && password.matches(".*[A-Z].*")
                && password.matches(".*[a-z].*")
                && password.matches(".*\\d.*")
                && password.matches(".*[@$!%*?&].*");
    }
}
