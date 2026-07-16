package com.example.demo.repository;

import com.example.demo.entity.PasswordResetCode;
import com.example.demo.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PasswordResetCodeRepository extends JpaRepository<PasswordResetCode, Long> {
    Optional<PasswordResetCode> findTopByUserOrderByCreatedAtDesc(User user);
    void deleteByUser(User user);
}
