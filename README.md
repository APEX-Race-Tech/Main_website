# Race Insight

<div align="center">

![Race Insight Logo](assets/app_icon.png)

**The Motorsport Data Analysis Platform**

[![Download](https://img.shields.io/badge/Download-Race%20Insight-blue)](https://apexracetech.in/race-insight.html)
[![Documentation](https://img.shields.io/badge/Docs-Read%20More-green)](https://docs.apexracetech.in)
[![Website](https://img.shields.io/badge/Website-APEX%20Race%20Tech-orange)](https://apexracetech.in)

[Download](#download) • [Documentation](#documentation) • [Features](#features) • [Support](#support)

</div>

---

## About Race Insight

**Race Insight** is a professional-grade motorsports data analysis application designed for sim racers and motorsport enthusiasts. Analyze your racing data, compare laps, and improve your performance with powerful visualization tools and intelligent data processing.

Built with a high-performance Rust-powered backend, Race Insight handles large-scale racing data with zero lag, making it the perfect tool for serious racers who demand precision and speed.

### Current Status: Beta

Race Insight is currently in **BETA** (free) phase. The software is fully functional for data analysis, with some advanced features (AI Insights, cloud sync) in development. Beta phase expires June 30, 2026.

---

## Features

### 🚀 Data Import
- **Universal Format Support**: Works with all major racing data formats including:
  - iRacing (`.ibt`)
  - MoTeC (`.ld`)
  - AiM (`.xrk`, `.drk`)
  - RaceLogic (`.vbox`)
  - Custom CSV files
- **Lightning-Fast Processing**: Upload files as large as 200MB+ and they're ready to analyze in seconds
- **Offline Capability**: Import once, analyze anywhere—even without internet connection

### 📊 Data Management
- **Smart Session Filtering**: Filter sessions by track, driver, or vehicle
- **Instant Performance Stats**: View average lap times, consistency scores, and theoretical bests at a glance
- **Visual Previews**: Integrated GPS track maps and lap-time trend charts

### 📈 Analysis
- **Professional Graphing Engine**: Smooth, lag-free graphs that respond instantly
- **Synchronized Ecosystem**: Move your cursor and watch track position, G-forces, and gauges update in perfect sync
- **Multi-Lap Comparison**: Compare any laps side-by-side, even if recorded at different rates

### 🤖 Custom Workbook (AI Workbook)
- **AI-Powered Creation**: Describe what you want in plain English and watch your custom dashboard come to life
- **Drag-and-Drop Design**: Build your perfect workspace by dragging, resizing, and arranging widgets
- **Professional Widget Library**: Speed dials, throttle/brake displays, tire monitors, G-force gauges, and more

### 💾 Data Export
- **CSV Export**: Save analyzed data in a format compatible with Excel, MATLAB, and other tools
- **PDF Reports**: Generate professional PDF reports with analysis, graphs, and insights
- **Track Map Export**: Save high-quality track maps with lap data overlaid

---

## Download

Race Insight is available for **Windows**, **Linux**, and **macOS**.

### Quick Download

Visit our website to download the latest version:
👉 **[Download Race Insight](https://apexracetech.in/race-insight.html)**

### Direct Download Links

- **Windows**: [RACE-Insight-Setup-0.1.0.exe](https://github.com/APEX-Race-Tech/RACE-Insight/releases/download/v0.1.0/RACE-Insight-Setup-0.1.0.exe)
- **Linux**: [RaceInsight_Setup_Linux.AppImage](https://github.com/APEX-Race-Tech/RACE-Insight/releases/download/v0.1.0/RaceInsight_Setup_Linux.AppImage)
- **macOS**: [RaceInsight_Setup_Mac.dmg](https://github.com/APEX-Race-Tech/RACE-Insight/releases/download/v0.1.0/RaceInsight_Setup_Mac.dmg)

### System Requirements

- **Windows**: Windows 10 or later
- **Linux**: Modern Linux distribution with AppImage support
- **macOS**: macOS 10.15 (Catalina) or later

---

## Documentation

Comprehensive documentation is available at:
📚 **[docs.apexracetech.in](https://docs.apexracetech.in)**

The documentation includes:
- Getting started guide
- Data import instructions
- Analysis workflow tutorials
- Custom workbook creation guide
- Export options and formats
- Troubleshooting tips

---

## Links

- **Official Website**: [apexracetech.in](https://apexracetech.in)
- **Race Insight Page**: [apexracetech.in/race-insight.html](https://apexracetech.in/race-insight.html)
- **Documentation**: [docs.apexracetech.in](https://docs.apexracetech.in)
- **APEX Race Technologies**: [apexracetech.in](https://apexracetech.in)

### Social Media

- **Instagram**: [@apex.race.tech](https://www.instagram.com/apex.race.tech/)

---

## Getting Started

1. **Download** Race Insight from the [official website](https://apexracetech.in/race-insight.html)
2. **Install** the application on your system
3. **Sign in** with your Google account (required for first-time setup)
4. **Import** your racing data files (drag & drop or file browser)
5. **Analyze** your data with professional-grade visualization tools

### First Steps

- Import a racing data file from your favorite racing simulator
- Explore the data overview to see your session statistics
- Use the analysis tools to compare laps and identify improvement areas
- Create custom workbooks with AI-powered widgets

---

## Known Limitations

- Data downsampling may affect accuracy for very large datasets (>1GB)
- Some file format parsers are in development (ECUMaster, Race Technology, MegaLogViewer)
- WiFi/Logger integration is simulated (not yet functional)
- Performance may degrade with files larger than 1GB

---

## Offline Capability

Race Insight works mostly offline:
- ✅ File import and analysis work offline (after initial sign-in)
- ✅ Data visualization works offline
- ⚠️ First-time sign-in requires internet (Google authentication)
- ⚠️ Map tiles (Mapbox/OpenStreetMap) require internet

---

## Support

### Issues and Bug Reports

If you encounter any issues or bugs, please:
1. Check the [documentation](https://docs.apexracetech.in) for troubleshooting tips
2. Visit our [website](https://apexracetech.in) for support resources
3. Contact us through our official channels

### Legal Documents

- [End User License Agreement (EULA)](https://apexracetech.in/race-insight/eula.html)
- [Terms of Service](https://apexracetech.in/race-insight/terms.html)
- [Privacy Policy](https://apexracetech.in/race-insight/privacy-policy.html)
- [Third-Party Licenses](https://apexracetech.in/race-insight/third-party-licenses.html)

---

## Technology

Race Insight is built with:
- **Backend**: Rust (Axum & Tokio) for high-performance data processing
- **Frontend**: Modern web technologies for responsive UI
- **Storage**: IndexedDB for local data persistence
- **Authentication**: Firebase Authentication

---

## License

Race Insight is proprietary software developed by **APEX Race Technologies**. See the [EULA](https://apexracetech.in/race-insight/eula.html) for full license terms.

---

## About APEX Race Technologies

**APEX Race Technologies** is dedicated to providing professional-grade tools for motorsport enthusiasts and sim racers. We're committed to helping you analyze your data, improve your performance, and achieve your racing goals.

**Made with ❤️‍🔥 From 🇮🇳**

---

## Disclaimer

Race Insight is an analysis tool for reviewing historical racing data. It is not a predictive system and should not be relied upon for making critical decisions for competition, safety-critical analysis, or warranty or performance claims.

Always verify analysis results manually before making decisions based on the Software's output.

---

<div align="center">

**[Download Now](https://apexracetech.in/race-insight.html)** • **[Read the Docs](https://docs.apexracetech.in)** • **[Visit Website](https://apexracetech.in)**

© 2026 APEX Race Technologies. All rights reserved.

</div>
