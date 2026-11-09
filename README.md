# getswarmbot.com

Landing page for [Swarm for Synology](https://github.com/getswarmbot/swarm). One static page, no build step.

- `index.html`: the page.
- `bee3d.js`: the bee robot as a 3D model built from code, in the flat style of the logo. It turns from its front view to its side view as it flies between the sections. Where WebGL is missing, the logo (`icon-512.png`) flies in its place.
- `vendor/three.module.min.js`: three.js 0.170.0 (MIT), served from the site itself.
- `screens/`: portal screenshots from the repository's demo fleet (made-up customers).
- `CNAME`: for GitHub Pages.

Preview locally with any static server, for example `python3 -m http.server`.
