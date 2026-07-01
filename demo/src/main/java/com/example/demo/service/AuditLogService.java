package com.example.demo.service;

import com.example.demo.entity.AuditLog;
import com.example.demo.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;

    public void logAction(String username, String action) {
        String activeUser = (username == null || username.trim().isEmpty()) ? "Système/Anonyme" : username;
        AuditLog log = AuditLog.builder()
                .timestamp(LocalDateTime.now())
                .username(activeUser)
                .action(action)
                .build();
        auditLogRepository.save(log);
    }

    public List<AuditLog> getAllLogs() {
        return auditLogRepository.findAll(Sort.by(Sort.Direction.DESC, "timestamp"));
    }
}
