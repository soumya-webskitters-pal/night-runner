# Night Runner

A neon 3D endless runner built with Three.js. Run through a dark futuristic city, jump over barriers, roll beneath flying obstacles, and chase your highest score.

## Play

[Play Night Runner on Netlify]
https://imaginative-blini-3595a1.netlify.app/

## Game controls

| Action | Control |
| --- | --- |
| Jump | Press `↑` once |
| Super jump | Double-press `↑` rapidly |
| Roll | Press and hold `↓` |

## Runners

Choose a runner before starting or change characters during the game:

- Tron Legend — default neon runner
- Sonic Blue
- Sonic Yellow
- Nicky
- Cha Cha
- Diaper Zombie

Only the default runner model loads during startup. Other 3D character models load when selected, while their lightweight preview images load with the page.

## Features

- Animated 3D runner models
- Increasing game speed and difficulty
- Normal and super jumps
- Ground and flying obstacles
- Character-selection menu
- Low and High graphics modes
- Adaptive resolution in Low graphics mode
- Background music and gameplay sound effects
- Sound toggle
- Current and highest scores
- Highest-score persistence with IndexedDB
- Live FPS meter
- Responsive controls and menus
- Neon particles, speed lines, shadows, and visual effects

## Run locally

This is a static web project, so no build step is required.

```bash
cd /path/to/jumper
python3 -m http.server 5173
```

Then open with "live server".

Running through a local server is required because the game loads JavaScript modules, 3D models, textures, and animation files.

## Technology

- Three.js
- GSAP
- HTML5
- CSS3
- JavaScript
- IndexedDB
- Netlify

## Project structure

```text
.
├── index.html
├── script.js
├── style.css
├── players/
├── obstacles/
├── favicon.png
└── poster.png
```

## Credits

Created by ChatGPT.  
Hosted by Netlify
vibe coder: Soumya Pal.

3D models and related assets retain the licensing terms included in their respective asset folders.
