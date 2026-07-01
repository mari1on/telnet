package com.example.demo.controller;

import com.example.demo.entity.Risque;
import com.example.demo.service.RisqueService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/risques")
public class RisqueController {
    private final RisqueService risqueService;

    public RisqueController(RisqueService risqueService) {
        this.risqueService = risqueService;
    }

    @GetMapping
    public List<Risque> getAllRisques() {
        return risqueService.getAllRisques();
    }
}
