package com.example.demo.dto;

import lombok.Data;

public class AuthDTOs {

    @Data
    public static class LoginRequest {
        private String username;
        private String password;
    }

    @Data
    public static class SignupRequest {
        private String username;
        private String email;
        private String password;
        private String role; // optional, e.g., "USER" or "RSSI"
    }

    @Data
    public static class JwtResponse {
        private String token;
        private String type = "Bearer";
        private Long id;
        private String username;
        private String email;
        private String role;

        public JwtResponse(String accessToken, Long id, String username, String email, String role) {
            this.token = accessToken;
            this.id = id;
            this.username = username;
            this.email = email;
            this.role = role;
        }
    }

    @Data
    public static class ProfileUpdateRequest {
        private String username;
        private String email;
    }

    @Data
    public static class MessageResponse {
        private String message;

        public MessageResponse(String message) {
            this.message = message;
        }
    }
}
