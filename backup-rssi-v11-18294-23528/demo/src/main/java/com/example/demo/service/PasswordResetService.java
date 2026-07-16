package com.example.demo.service;

import com.example.demo.entity.PasswordResetCode;
import com.example.demo.entity.User;
import com.example.demo.repository.PasswordResetCodeRepository;
import com.example.demo.repository.UserRepository;
import jakarta.transaction.Transactional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Optional;

@Service
public class PasswordResetService {

    private static final Duration CODE_VALIDITY = Duration.ofMinutes(10);
    private static final Duration RESEND_DELAY = Duration.ofSeconds(60);
    private static final int MAX_FAILED_ATTEMPTS = 5;

    private final UserRepository userRepository;
    private final PasswordResetCodeRepository codeRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;
    private final SecureRandom secureRandom = new SecureRandom();

    public PasswordResetService(UserRepository userRepository,
                                PasswordResetCodeRepository codeRepository,
                                PasswordEncoder passwordEncoder,
                                EmailService emailService) {
        this.userRepository = userRepository;
        this.codeRepository = codeRepository;
        this.passwordEncoder = passwordEncoder;
        this.emailService = emailService;
    }

    @Transactional
    public void requestReset(String rawIdentifier) {
        Optional<User> optionalUser = findUser(rawIdentifier);
        if (optionalUser.isEmpty()) return;

        User user = optionalUser.get();
        LocalDateTime now = LocalDateTime.now();
        Optional<PasswordResetCode> latest = codeRepository.findTopByUserOrderByCreatedAtDesc(user);
        if (latest.isPresent()
                && !latest.get().isUsed()
                && latest.get().getCreatedAt().plus(RESEND_DELAY).isAfter(now)) {
            return;
        }

        codeRepository.deleteByUser(user);
        String code = String.format(Locale.ROOT, "%06d", secureRandom.nextInt(1_000_000));
        PasswordResetCode resetCode = new PasswordResetCode();
        resetCode.setUser(user);
        resetCode.setCodeHash(passwordEncoder.encode(code));
        resetCode.setCreatedAt(now);
        resetCode.setExpiresAt(now.plus(CODE_VALIDITY));
        resetCode.setUsed(false);
        resetCode.setFailedAttempts(0);
        codeRepository.save(resetCode);

        try {
            emailService.sendPasswordResetCode(user.getEmail(), user.getUsername(), code);
        } catch (RuntimeException ex) {
            codeRepository.delete(resetCode);
            throw ex;
        }
    }

    @Transactional
    public void resetPassword(String rawIdentifier, String code, String newPassword) {
        User user = findUser(rawIdentifier)
                .orElseThrow(() -> new IllegalArgumentException("Code invalide ou expiré."));

        PasswordResetCode resetCode = codeRepository.findTopByUserOrderByCreatedAtDesc(user)
                .orElseThrow(() -> new IllegalArgumentException("Code invalide ou expiré."));

        LocalDateTime now = LocalDateTime.now();
        if (resetCode.isUsed() || resetCode.getExpiresAt().isBefore(now)) {
            throw new IllegalArgumentException("Code invalide ou expiré.");
        }
        if (resetCode.getFailedAttempts() >= MAX_FAILED_ATTEMPTS) {
            throw new IllegalArgumentException("Trop de tentatives. Demandez un nouveau code.");
        }
        if (code == null || !code.matches("\\d{6}") || !passwordEncoder.matches(code, resetCode.getCodeHash())) {
            resetCode.setFailedAttempts(resetCode.getFailedAttempts() + 1);
            codeRepository.save(resetCode);
            throw new IllegalArgumentException("Code invalide ou expiré.");
        }
        if (!isStrongPassword(newPassword)) {
            throw new IllegalArgumentException(
                    "Le nouveau mot de passe doit contenir au moins 8 caractères, une majuscule, "
                            + "une minuscule, un chiffre et un caractère spécial parmi @$!%*?&."
            );
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        resetCode.setUsed(true);
        codeRepository.save(resetCode);
    }

    private Optional<User> findUser(String rawIdentifier) {
        if (rawIdentifier == null || rawIdentifier.isBlank()) return Optional.empty();
        String identifier = rawIdentifier.trim();
        return userRepository.findByUsername(identifier)
                .or(() -> userRepository.findByEmail(identifier));
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
