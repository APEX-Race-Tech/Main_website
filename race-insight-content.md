# RACE Insight Website Content

This document contains specialized content extracted from the RACE Insight software for use on the marketing website.

---

## 1. Data Import
### Seamless Ingestion for High-Performance Analysis

![Data Import](assets/images/data-import.png)

RACE Insight features a high-performance Rust-powered backend designed to handle large-scale motorsports telemetry data with zero lag.

**Universal Format Support**: Direct support for industry-standard formats including MoTeC (.ld), iRacing (.ibt), AiM (.xrk, .drk), RaceLogic (.vbox), and custom CSV mappings.

**High-Speed Processing**: Built with Axum & Tokio, our backend parses files as large as 200MB+ in seconds, preparing them for instant visualization.

**Offline Reliability**: Leverages IndexedDB for local persistence, allowing you to ingest once and analyze anywhere, even without an internet connection.

---

## 2. Data Overview and Management
### Intelligent Session Intelligence at a Glance

![Data Overview](assets/images/data-overview.png)

The Data Overview hub provides a comprehensive interface for managing your entire racing career's worth of data.

**Advanced Session Queue**: Instantly filter through thousands of sessions by Track, Driver, or Vehicle. Sort by date, lap count, or best lap time to find the data you need.

**Real-Time Previews**: Select a session to view instant performance statistics, including average lap times, consistency scores, and theoretical bests.

**Interactive Spatial Previews**: Integrated GPS track maps and lap-time trend charts provide immediate context for every session before you dive into deep analysis.

---

## 3. Analysis
### High-Fidelity Visualization for Split-Second Decisions

![Analysis](assets/images/telemetry_graphs_ui.png)

The analysis engine is the heart of RACE Insight, providing professional-grade graphing tools that keep up with your data.

**Professional Graphing Engine**: High-fidelity time-series visualization using ECharts, optimized for 100Hz+ telemetry data with fluid 60FPS interaction.

**Synchronized Ecosystem**: A unified cursor system ensures that moving your mouse on a graph updates the track map, G-force gauges, and technical widgets simultaneously.

**Multi-Lap Comparison**: Compare laps with ease. Our system interpolates data between laps of different frequencies to provide perfectly aligned delta comparisons.

---

## 4. Custom Workbook (AI Workbook)
### Your Modular Mission Control

![Custom Workbook](assets/images/custom-workbook.png)

Build a bespoke analysis environment with our drag-and-drop modular workspace.

**AI-Driven Layout Generation**: Use natural language to instantly create custom workbook layouts and complex analysis graphs tailored to your specific racing discipline.

**Dynamic Workspace Canvas**: A futuristic, grid-snapping canvas where you can place, resize, and arrange widgets to create your ideal dashboard.

**Modular Library**: Choose from a growing library of professional widgets including Speed & RPM Dials, Driver Input Dashboards, Professional Tyre Monitors, and G-Force Gauges & Hybrid System Monitors.

---

## 5. Data Export
### Open Compatibility for Professional Workflows

![Data Export](assets/images/data-export.png)

RACE Insight respects your data sovereignty, ensuring you can move your data wherever it needs to go.

**Standardized CSV Export**: Export your refined telemetry data to a clean, well-documented CSV format compatible with Excel, MATLAB, and specialized data science tools.

**MoTeC Ecosystem Integration**: Generate .ldx metadata files to preserve event details and beacon markers across professional analysis software.

**Batch Exporting**: Efficiently process and export multiple laps or entire sessions for external reporting and team sharing.

---

