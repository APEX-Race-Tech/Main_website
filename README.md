# APEX Race Technologies Website

This repository contains the official company website for APEX Race Technologies. It is a modern, single-page website designed to showcase the company's brand, products, and contact information.

## Features

- **Fully Responsive Design:** The layout fluidly adapts to all screen sizes, from mobile phones to desktop monitors.
- **Interactive UI/UX:** Features smooth scrolling, a dynamic header, and subtle animations to enhance user experience.
- **Mobile-First Navigation:** Includes a functional hamburger menu for easy navigation on smaller devices.
- **Social Media Integration:** A fixed social media bar provides easy access to the company's social profiles.
- **Modular CSS:** Styles are organized into partials (`_base.css`, `_layout.css`, `_components.css`, etc.) for better maintainability.

## Technologies Used

- **HTML5:** For the core structure and content of the website.
- **CSS3:** For all styling, including Flexbox and Grid for layout, custom properties for theming, and media queries for responsiveness.
- **JavaScript (ES6+):** For all interactive functionality, including the mobile menu, scroll effects, and dynamic content visibility.

## How to View

There is no server-side setup required. To view the website, simply open the `index.html` file in any modern web browser.

1.  Clone or download this repository.
2.  Navigate to the project's root directory.
3.  Open `index.html` in your browser (e.g., Chrome, Firefox, Safari).

## Contact Form

The contact form is powered by [Web3Forms](https://web3forms.com/). When a user submits the form, the data is sent to the Web3Forms API endpoint specified in the `action` attribute of the form tag in `index.html`.

## Acknowledgements

- The track animation feature utilizes racetrack coordinate data from the [TUMFTM Racetrack Database](https://github.com/TUMFTM/racetrack-database?tab=LGPL-3.0-1-ov-file), which is available under the LGPL-3.0-1 license.
