---
title: "Faking Stars: How to Make Artificial Stars Look Real"
date: 2026-10-12
permalink: /posts/2026/10/faking-stars/
excerpt: "Most tutorials draw a star as a Gaussian blob. A real star is a diffraction pattern: rings, spikes from the spider vanes and the fingerprints of every optical imperfection. This post builds that pattern from the physics, with interactive figures all the way down."
read_time_minutes: 20   # the automatic estimate also counts LaTeX source and captions
tags:
  - astrophotography
  - optics
  - simulation
extra_css:
  - /assets/css/blog-widgets.css
extra_js:
  - /assets/js/blog-widgets.js
---

{% assign fs = "/images/blog/faking-stars" | relative_url %}

<aside class="post-disclaimer" role="note">
<span class="post-disclaimer__tag">Disclaimer</span>
This post was written with the help of Claude Opus 5.5. It is based on code I developed for my deconvolution software, Aberration Remover.
</aside>

Synthetic images are everywhere in modern astronomy. To train a neural network that denoises, deconvolves or removes stars from astrophotos, to test a photometry pipeline, or simply to check that some code does what it should, you need images where the ground truth is known exactly. And the most common object in those images is a star.

Making a star looks trivial: it is a point of light, blurred a bit. Most tutorials draw it as a Gaussian blob and move on. But a network trained on Gaussian stars learns a sky that does not exist. Drag the slider below to compare the textbook recipe with the stars this post will build.

<figure class="bw">
<div class="bw-compare">
<img src="{{ fs }}/field/field_physical.webp" alt="A star field where the bright stars have diffraction spikes, soft halos and colours" width="1200" height="720">
<div class="bw-compare__top"><img src="{{ fs }}/field/field_gauss.webp" alt="The same star field drawn with Gaussian stars: the bright stars are plain white dots" width="1200" height="720"></div>
<div class="bw-compare__handle" aria-hidden="true"></div>
<span class="bw-compare__tag bw-compare__tag--left">Gaussian stars</span>
<span class="bw-compare__tag bw-compare__tag--right">Physical stars</span>
<input type="range" min="0" max="100" value="50" aria-label="Position of the divider between Gaussian and physical stars">
</div>
<figcaption>The same few hundred stars, with the same positions, brightnesses, colours and noise. <strong>Left:</strong> every star is a 2D Gaussian with the width of the real core. <strong>Right:</strong> stars modelled with Fourier optics: a 200&nbsp;mm reflector with a 30% central obstruction and four spider vanes, small aberrations, white light, 1.8″ atmospheric seeing, 0.5″ pixels. Both images get the same non-linear stretch.</figcaption>
</figure>

This post is about the right-hand image. We will start from the usual recipe and see where it breaks, then rebuild a star from the physics: light as a wave, diffraction, the Fourier transform, the spikes made by the spider vanes and the aberrations described by Zernike polynomials. There is math along the way, and the post does not shy away from it, but whenever a tool might be rusty you will find a box marked **Math refresher**. They are closed by default; open the ones you need.

<div class="post-toc" markdown="1">
**Contents**

* TOC
{:toc}
</div>

## The usual recipe: a Gaussian blob

Search for how to simulate a star field and you will find variations of the same idea. The Astropy CCD Data Reduction Guide builds "an artificial (but realistic) image" whose stars, in its own words, "are essentially just (round) Gaussian sources"[^ccd-guide]. The photutils documentation simulates stars by placing a `CircularGaussianPRF` model at random positions[^photutils], and Astropy's tutorial on synthetic images mimics the telescope by convolving with a `Gaussian2DKernel`[^synthetic]. All three draw a star of flux $$F$$ at $$(x_0, y_0)$$ as

$$
I(x,y) = \frac{F}{2\pi\sigma^2}\exp\left(-\frac{(x-x_0)^2+(y-y_0)^2}{2\sigma^2}\right),
$$

where the width $$\sigma$$ sets the apparent size of the star, usually quoted as the full width at half maximum, $$\mathrm{FWHM} = 2\sqrt{2\ln 2}\,\sigma \approx 2.355\,\sigma$$.

For what those tutorials do, this is a perfectly reasonable choice: a photometry or reduction pipeline mostly cares that each star has roughly the right size and the right flux. The Gaussian is easy to integrate, it is separable in $$x$$ and $$y$$, and two Gaussian blurs combine into another Gaussian whose variance is the sum of the two. There is even a statistical argument for it: many small, independent blurs (telescope shake, guiding errors, turbulence averaged over a long exposure) add up to a Gaussian core, by the central limit theorem.

The problem is everything outside the core. The figure below compares a Gaussian with the pattern that a perfect telescope actually produces, the *Airy pattern*, which we will derive in a moment. The Gaussian is chosen to have exactly the same FWHM.

<figure class="bw">
<div class="bw__bar">
<div class="bw-toggle" role="radiogroup" aria-label="Display scale">
<label><input type="radio" name="fs-profiles" data-bw-key="mode" value="linear" checked><span>Linear display</span></label>
<label><input type="radio" name="fs-profiles" data-bw-key="mode" value="log"><span>Logarithmic display</span></label>
</div>
</div>
<img class="bw__img" data-bw-src="{{ fs }}/profiles/gauss_vs_airy_{mode}.webp" src="{{ fs }}/profiles/gauss_vs_airy_linear.webp" alt="A Gaussian star and an Airy pattern side by side, with their radial profiles" width="1440" height="510">
<figcaption>A Gaussian and an Airy pattern with the same FWHM (1.03&nbsp;\(\lambda/D\)). In a linear display they are almost indistinguishable. A logarithmic display, closer to what astrophotographers do when they stretch an image, tells a different story.</figcaption>
</figure>

On a linear scale the two are nearly identical, which is why the Gaussian survives in so many tutorials. On a logarithmic scale they are completely different objects. The Gaussian falls off as $$e^{-r^2/2\sigma^2}$$, faster than any power of $$r$$. The Airy pattern has rings, and their envelope decays only as $$r^{-3}$$: at $$5\,\lambda/D$$ from the centre, the real star is about $$10^{25}$$ times brighter than the Gaussian. About 16% of the light of a perfect star falls outside its central disk; the Gaussian leaves out just 2%.

This matters because astronomical images are almost never looked at linearly. Deep images are stretched to bring out faint structure, and a network trained on them sees the wings of every bright star. A model that only ever saw Gaussian stars will either stumble on real halos or try to "fix" them.

Some recipes switch to the Moffat profile[^moffat], $$I \propto \left[1 + (r/\alpha)^2\right]^{-\beta}$$, whose power-law wings describe stars blurred by the atmosphere much better (a Gaussian is the limit $$\beta \to \infty$$). It fits the core and the halo well, but it is still a fit: it has no rings, no spikes, and no idea which telescope took the picture. For those we have to go back to the physics.

## Light is a wave

Light is an electromagnetic wave: an electric field that oscillates as it travels. For light of a single colour, called *monochromatic* light, the oscillation is a perfect sinusoid. At any fixed point the field swings back and forth at a fixed frequency, about $$5\times10^{14}$$ times per second for green light, and if you could freeze time you would see the same pattern repeat every *wavelength* $$\lambda$$ along the direction of travel (550 nanometres for green light). Two simplifications will carry us through most of this post: we describe the field by a single number at each point, ignoring polarisation, which is an excellent approximation for telescopes; and we stick to one wavelength until the section on [white light](#white-light).

<figure class="bw">
<img class="bw__img" data-bw-src="{{ fs }}/wave/{colour}_{t}.webp" src="{{ fs }}/wave/green_0.webp" alt="A sinusoidal wave along the beam with its wavelength marked, and the oscillation of the field at one point over time with its period marked" width="1440" height="460">
<div class="bw__controls">
<div class="bw-toggle" role="radiogroup" aria-label="Colour of the light">
<label><input type="radio" name="fs-wave-colour" data-bw-key="colour" value="blue"><span>Blue, 450 nm</span></label>
<label><input type="radio" name="fs-wave-colour" data-bw-key="colour" value="green" checked><span>Green, 550 nm</span></label>
<label><input type="radio" name="fs-wave-colour" data-bw-key="colour" value="red"><span>Red, 650 nm</span></label>
</div>
<label class="bw-slider">
<span class="bw-slider__head"><span>Time</span></span>
<input type="range" data-bw-key="t" min="0" max="23" step="1" value="0" aria-label="Time">
</label>
<button type="button" class="bw-play" data-bw-play="t" data-bw-interval="120" data-bw-loop data-bw-autoplay><span class="bw-play__play">&#9654; Play</span><span class="bw-play__pause">&#10074;&#10074; Pause</span></button>
</div>
<figcaption>A monochromatic light wave. Left: the field along the beam at one instant, a sinusoid that repeats every wavelength and moves forward at the speed of light. Right: the field at the dotted point as time passes, which repeats every period \(T = \lambda/c\). A different colour is simply a different wavelength.</figcaption>
</figure>

At any instant, each point of the wave is somewhere in its cycle: on a crest, in a trough, or in between. That position in the cycle is the *phase* of the wave at that point, an angle that grows by $$2\pi$$, one full cycle, for every wavelength the wave travels. A **wavefront** is a surface joining points that have the same phase, for example all the points sitting on a crest. Think of the ripples spreading from a stone dropped into a pond: every ring is a wavefront, and neighbouring rings are one wavelength apart. A wave always travels perpendicular to its wavefronts, and the light rays of school optics are nothing more than lines drawn perpendicular to them.

<figure class="bw">
<img class="bw__img" data-bw-src="{{ fs }}/ripples/ripples_{t}.webp" src="{{ fs }}/ripples/ripples_0.webp" alt="Circular waves spreading from a point source, shown as field and as phase, with wavefronts and rays drawn on top" width="1440" height="760">
<div class="bw__controls">
<label class="bw-slider">
<span class="bw-slider__head"><span>Time</span></span>
<input type="range" data-bw-key="t" min="0" max="15" step="1" value="0" aria-label="Time">
</label>
<button type="button" class="bw-play" data-bw-play="t" data-bw-interval="110" data-bw-loop data-bw-autoplay><span class="bw-play__play">&#9654; Play</span><span class="bw-play__pause">&#10074;&#10074; Pause</span></button>
</div>
<figcaption>A wave spreading from a point source, seen from above like ripples on a pond. Left: the field at one instant, light on the crests and dark in the troughs. Right: the phase of the same wave, where each colour is one position in the cycle. The circles are wavefronts, drawn on the crests: lines of constant phase, one wavelength apart. The orange arrows are rays, everywhere perpendicular to the wavefronts.</figcaption>
</figure>

A star sends light in every direction, so its wavefronts are spheres centred on the star: the pond's ripples, in three dimensions. By the time they reach us these spheres are unimaginably large. Even for the nearest star, a patch of wavefront as wide as a 200&nbsp;mm telescope deviates from a flat plane by about $$10^{-19}$$&nbsp;m, less than a trillionth of a wavelength. So the starlight reaching a telescope is a **plane wave**: a train of flat, parallel wavefronts, perpendicular to the direction of the star. A star slightly off-axis simply sends a slightly tilted plane wave. Stars are also so far away that their discs are much smaller than the finest detail any of the telescopes in this post can resolve, so each star behaves as a single point of light.

<figure class="bw">
<img class="bw__img" src="{{ fs }}/intro/plane_wave.webp" alt="Spherical wavefronts around a star, and a zoom on a telescope-sized patch where they look flat and parallel" width="1440" height="550" loading="lazy">
<figcaption>Not to scale. Close to the star the wavefronts are spheres; zoom into a patch the size of a telescope, very far away, and they are flat and parallel, with parallel rays: a plane wave. A sphere of radius \(R\) departs from its tangent plane by \(s \approx a^2/2R\) at a distance \(a\) from the point where they touch. With \(a = 10\) cm (half of a 200&nbsp;mm aperture) and \(R = 4.2\) light-years, the distance of the nearest star, \(s \approx 10^{-19}\) m.</figcaption>
</figure>

The **aperture** of a telescope is the opening that collects this light: the clear area of its main mirror or lens, whose diameter $$D$$ is the number telescopes are usually named after (a "200&nbsp;mm reflector"). Light that misses it is lost, and in a reflector the secondary mirror and its supports block part of it too; we will meet them later. Opticians also call the aperture the **pupil**, by analogy with the eye, and we will use both words. The telescope takes the piece of plane wave that passes through the aperture and bends its flat wavefronts into spheres that shrink onto a single point of the *focal plane*, where the camera sits. In the language of rays, every ray from the star meets at that point, and the image of the star would be infinitely small. It is not, because light is a wave and the aperture has an edge: the wavefront that gets through has been cut off abruptly, and a cut-off wave can never be squeezed into a single point.

<figure class="bw">
<img class="bw__img" data-bw-src="{{ fs }}/telescope/telescope_{a}_{t}.webp" src="{{ fs }}/telescope/telescope_2_0.webp" alt="Plane wavefronts entering a lens of aperture D and converging as spherical wavefronts onto the focus in the focal plane" width="1440" height="570">
<div class="bw__controls">
<label class="bw-slider">
<span class="bw-slider__head"><span>Direction of the starlight</span><output data-bw-show="a"></output></span>
<input type="range" data-bw-key="a" min="0" max="4" step="1" value="2" data-bw-labels="−6°|−3°|0° (on axis)|+3°|+6°" aria-label="Direction of the starlight">
</label>
<label class="bw-slider">
<span class="bw-slider__head"><span>Time</span></span>
<input type="range" data-bw-key="t" min="0" max="15" step="1" value="0" aria-label="Time">
</label>
<button type="button" class="bw-play" data-bw-play="t" data-bw-interval="110" data-bw-loop data-bw-autoplay><span class="bw-play__play">&#9654; Play</span><span class="bw-play__pause">&#10074;&#10074; Pause</span></button>
</div>
<figcaption>A telescope, drawn as a simple lens (a mirror does the same job, folded back on itself). Only the part of the plane wave that falls inside the aperture \(D\) gets through, and the lens turns its flat wavefronts into spheres that shrink onto the focus; the orange lines are the matching rays. Light from a star in another direction focuses at another point of the focal plane (angles exaggerated).</figcaption>
</figure>

To find out what the image looks like instead, we will have to add up a great many waves arriving at the same point with different delays. Waves of the same frequency always add up to another wave of that frequency,

$$
A_1\cos(\omega t - \varphi_1) + A_2\cos(\omega t - \varphi_2) = A\cos(\omega t - \varphi),
$$

where $$\omega = 2\pi c/\lambda$$ is the angular frequency, but finding $$A$$ and $$\varphi$$ with trigonometric identities quickly becomes painful when there are thousands of waves. This is why optics uses complex numbers. A wave of amplitude $$A$$ and phase $$\varphi$$ is represented by a single complex number, $$E = A\,e^{i\varphi}$$: an arrow of length $$A$$ pointing at the angle $$\varphi$$, called a *phasor*. Delaying a wave rotates its arrow. Adding waves means adding their arrows head to tail, so two waves in step reinforce each other, while two waves half a cycle apart cancel out. And the brightness a camera records, the *intensity*, is the squared length of the final arrow, $$I = \lvert E\rvert^2$$. The box below has the details.

<figure class="bw">
<img class="bw__img" data-bw-src="{{ fs }}/adding/adding_{r}_{p}.webp" src="{{ fs }}/adding/adding_0_4.webp" alt="Two waves and their sum drawn as curves, and the same waves drawn as arrows added head to tail" width="1440" height="500">
<div class="bw__controls">
<div class="bw-toggle" role="radiogroup" aria-label="Amplitude of the second wave">
<label><input type="radio" name="fs-adding" data-bw-key="r" value="0" checked><span>Equal amplitudes</span></label>
<label><input type="radio" name="fs-adding" data-bw-key="r" value="1"><span>Second wave half as strong</span></label>
</div>
<label class="bw-slider">
<span class="bw-slider__head"><span>Delay of the second wave</span><output data-bw-show="p"></output></span>
<input type="range" data-bw-key="p" min="0" max="24" step="1" value="4" data-bw-labels="0°|15°|30°|45°|60°|75°|90°|105°|120°|135°|150°|165°|180°|195°|210°|225°|240°|255°|270°|285°|300°|315°|330°|345°|360°" aria-label="Delay of the second wave">
</label>
</div>
<figcaption>Left: two waves of the same frequency and their sum, which is again a wave of that frequency. Right: the same waves as phasors. Delaying the second wave rotates its arrow, and the sum is the two arrows placed head to tail. In step (0°) the waves reinforce each other; half a cycle apart (180°) they cancel, completely if their amplitudes are equal. A camera measures \(\lvert E\rvert^2\), the squared length of the orange arrow.</figcaption>
</figure>

<details class="math-box" markdown="1">
<summary markdown="span"><span class="math-box__tag">Math refresher</span> Complex numbers and phasors</summary>

A complex number $$z = a + ib$$, with $$i^2 = -1$$, is a point in the plane: $$a$$ along the horizontal axis and $$b$$ along the vertical one. In polar form the same point is a length and an angle:

$$
z = r\,e^{i\varphi} = r\,(\cos\varphi + i\sin\varphi),
$$

which is Euler's formula. The length $$r = \lvert z\rvert$$ is the *magnitude* and the angle $$\varphi$$ is the *phase*. Two rules make complex numbers the perfect bookkeeping tool for waves:

- Multiplying by $$e^{i\alpha}$$ rotates a number by the angle $$\alpha$$ without changing its length, because the angles add: $$e^{i\varphi}\,e^{i\alpha} = e^{i(\varphi+\alpha)}$$. Delaying a wave is a rotation.
- Adding complex numbers is adding arrows, head to tail, exactly like vectors.

Here is why the trick is allowed. The wave $$A\cos(\omega t - \varphi)$$ is the real part of $$A\,e^{i\varphi}\,e^{-i\omega t}$$, and taking the real part commutes with addition, $$\operatorname{Re} z_1 + \operatorname{Re} z_2 = \operatorname{Re}(z_1 + z_2)$$, so we can add the complex versions of the waves and take the real part only at the very end. The factor $$e^{-i\omega t}$$ is the same for every wave of the same frequency, so it can be dropped altogether, leaving the complex amplitude $$E = A\,e^{i\varphi}$$.

No camera can follow an oscillation at $$5\times10^{14}$$ Hz. Detectors measure the average power, which is proportional to the time average of $$A^2\cos^2(\omega t - \varphi)$$, that is $$A^2/2$$. Dropping the constant, the *intensity* is

$$
I = \lvert E\rvert^2 = E\,E^*,
$$

where $$E^*$$ is the complex conjugate (same length, opposite angle). The phase is invisible to a detector, but it decides how the waves add up *before* the squaring happens.
</details>

The recipe for adding them up is the *Huygens–Fresnel principle*: every point of the wavefront inside the aperture acts as a small source of new waves, and the field at any point of the focal plane is the sum of all their contributions. At the centre of the image the telescope is designed so that all paths have the same length. Every contribution arrives in phase, and they add up to the brightest possible spot.

Now pick a point slightly off-centre, at an angle $$\theta$$ on the sky. Light from one edge of the aperture now travels a little further than light from the other edge: from a point at position $$x$$ across the aperture the extra path is $$x\sin\theta \approx x\,\theta$$, which shifts its phase by $$2\pi x\theta/\lambda$$. Each phasor gets rotated by a different amount, and their sum shrinks. The figure below does that sum explicitly: the aperture is cut into 40 strips, each strip contributes one arrow, and the arrows are chained head to tail.

<figure class="bw">
<img class="bw__img" data-bw-src="{{ fs }}/phasors/{shape}_{t}.webp" src="{{ fs }}/phasors/slit_0.webp" alt="The aperture cut into coloured strips, the chain of phasors they contribute, and the resulting intensity as a function of angle" width="1440" height="490">
<div class="bw__controls">
<div class="bw-toggle" role="radiogroup" aria-label="Aperture shape">
<label><input type="radio" name="fs-phasor-shape" data-bw-key="shape" value="slit" checked><span>Slit</span></label>
<label><input type="radio" name="fs-phasor-shape" data-bw-key="shape" value="circle"><span>Circular mirror</span></label>
</div>
<label class="bw-slider">
<span class="bw-slider__head"><span>Angle on the sky \(\theta\)</span><span><output data-bw-show="t"></output> \(\lambda/D\)</span></span>
<input type="range" data-bw-key="t" min="0" max="62" step="1" value="0" data-bw-labels="0.00|0.05|0.10|0.15|0.20|0.25|0.30|0.35|0.40|0.45|0.50|0.55|0.60|0.65|0.70|0.75|0.80|0.85|0.90|0.95|1.00|1.05|1.10|1.15|1.20|1.22|1.25|1.30|1.35|1.40|1.45|1.50|1.55|1.60|1.65|1.70|1.75|1.80|1.85|1.90|1.95|2.00|2.05|2.10|2.15|2.20|2.23|2.25|2.30|2.35|2.40|2.45|2.50|2.55|2.60|2.65|2.70|2.75|2.80|2.85|2.90|2.95|3.00" aria-label="Angle on the sky">
</label>
<button type="button" class="bw-play" data-bw-play="t" data-bw-interval="120"><span class="bw-play__play">&#9654; Play</span><span class="bw-play__pause">&#10074;&#10074; Pause</span></button>
</div>
<figcaption>Each strip of the aperture contributes one arrow, with matching colours on the left and in the middle. The orange arrow is their sum, the field \(E\); its squared length is the intensity on the right, where the dashed curve is magnified 20 times to show the faint rings.</figcaption>
</figure>

At $$\theta = 0$$ all the arrows point the same way. As $$\theta$$ grows, the chain curls up. When the path difference across the aperture reaches exactly one wavelength, at $$\theta = \lambda/D$$, the phases run through a full turn: the chain closes into a circle and the sum is zero. That is the first dark ring. Keep going and the chain winds into a second loop that does not quite close (a faint bright ring), closes again at $$2\lambda/D$$, and so on.

Now switch to the circular mirror. Strips near the edge of a circle are short, so their arrows are short too, and the chain has to curl a little more before it closes: the first dark ring moves out to $$\theta = 1.22\,\lambda/D$$. That is the famous 1.22 of the Rayleigh resolution limit.

## The star is the Fourier transform of the telescope

Summing phasors over the whole aperture is an integral. Describe the aperture by its *pupil function* $$P(x,y)$$, equal to 1 where light passes and 0 where it is blocked, and write the angle on the sky as $$\boldsymbol\theta = (\theta_x, \theta_y)$$. The field in the focal plane is

$$
E(\boldsymbol\theta) \propto \iint P(x,y)\; e^{-i2\pi\,(x\theta_x + y\theta_y)/\lambda}\; dx\,dy ,
$$

and the image of the star, the *point spread function* (PSF), is its squared magnitude:

$$
\mathrm{PSF}(\boldsymbol\theta) = \lvert E(\boldsymbol\theta)\rvert^2 .
$$

That integral is the two-dimensional Fourier transform of the pupil function, evaluated at the spatial frequencies $$(\theta_x/\lambda,\ \theta_y/\lambda)$$. This is the central result of Fraunhofer diffraction, derived carefully in any optics textbook[^goodman], and everything in the rest of this post is an application of it. **The star is the Fourier transform of the telescope.**

<details class="math-box" markdown="1">
<summary markdown="span"><span class="math-box__tag">Math refresher</span> The Fourier transform</summary>

The Fourier transform rewrites a function as a sum of waves. In one dimension,

$$
\hat f(k) = \int_{-\infty}^{\infty} f(x)\, e^{-i2\pi kx}\, dx
$$

measures how much of the wave $$e^{i2\pi kx}$$ (frequency $$k$$, that is $$k$$ cycles per unit length) is contained in $$f$$. The inverse transform puts the waves back together. Compare it with the integral above: it is the same operation, applied to the pupil, with $$k = \theta/\lambda$$.

A handful of properties do almost all the work in this post:

- **Linearity.** The transform of a sum is the sum of the transforms. A pupil with a hole and a few vanes is a disk minus some smaller shapes, so its field is the disk's field minus theirs.
- **Scaling.** Stretching a function squeezes its transform: $$f(x/a)$$ becomes $$\lvert a\rvert\,\hat f(ak)$$. Wide in one domain means narrow in the other, so a wide mirror makes a small star.
- **Shift.** Multiplying $$f$$ by a linear phase $$e^{i2\pi a x}$$ shifts $$\hat f$$ by $$a$$. A tilted wavefront moves the star without changing its shape.
- **Symmetry.** If $$f$$ is real, $$\hat f(-k) = \hat f(k)^*$$, so $$\lvert\hat f\rvert^2$$ is symmetric about the origin.
- **Energy.** $$\int\lvert f\rvert^2\,dx = \int\lvert\hat f\rvert^2\,dk$$ (Parseval's theorem). Light is never lost, only redistributed.

Three transform pairs are worth knowing. A box of width $$D$$ becomes $$D\,\mathrm{sinc}(Dk)$$, with $$\mathrm{sinc}(u) = \sin(\pi u)/(\pi u)$$: that is the slit above. A disk becomes a Bessel function (below). And a Gaussian becomes another Gaussian.
</details>

For a circular aperture of diameter $$D$$ the integral can be done in closed form. With $$v = \pi D\theta/\lambda$$,

$$
\mathrm{PSF}(\theta) = I_0\left[\frac{2J_1(v)}{v}\right]^2 ,
$$

the Airy pattern, where $$J_1$$ is a Bessel function of the first kind. Its first zero is at $$v = 3.8317$$, which is $$\theta = 1.22\,\lambda/D$$. For a 200&nbsp;mm telescope in green light (550&nbsp;nm), $$\lambda/D$$ is 0.57 arcseconds and the first dark ring sits 0.69″ from the centre of the star.

<details class="math-box" markdown="1">
<summary markdown="span"><span class="math-box__tag">Math refresher</span> Bessel functions and the Airy pattern</summary>

Bessel functions appear whenever a problem has circular symmetry, the way sines and cosines appear for straight boundaries. $$J_n(v)$$ behaves like a slowly decaying cosine; for large $$v$$,

$$
J_1(v) \approx \sqrt{\frac{2}{\pi v}}\,\cos\!\left(v - \frac{3\pi}{4}\right).
$$

In polar coordinates the Fourier transform of a disk of radius $$R$$ reduces to a one-dimensional integral, $$\int_0^R J_0(2\pi k r)\,2\pi r\,dr = R\,J_1(2\pi kR)/k$$, which is where the Airy formula comes from. The function $$2J_1(v)/v$$ is sometimes called *jinc*, the circular cousin of sinc. Squaring the approximation above shows that the envelope of the rings falls as $$v^{-3}$$: a power law, which loses to a Gaussian in the core and wins by many orders of magnitude in the wings.
</details>

And the Gaussian? It is the Fourier transform of a Gaussian, so a telescope would produce Gaussian stars only if its mirror faded smoothly to black from the centre outwards, with no edge at all. Real mirrors have sharp edges, and sharp edges make rings.

## Computing a PSF with the FFT

For an arbitrary pupil we compute the Fourier transform numerically: sample the pupil on an $$N\times N$$ grid, pad it with zeros to $$QN \times QN$$, apply the fast Fourier transform (FFT) and take the squared magnitude.

```python
import numpy as np

N, Q = 256, 4                                  # pupil samples, padding factor
x = (np.arange(N) - N / 2 + 0.5) / (N / 2)     # pupil coordinates, radius 1
X, Y = np.meshgrid(x, x)
R = np.hypot(X, Y)

pupil = ((R <= 1) & (R >= 0.3)).astype(float)  # mirror with a 30% central obstruction
wavefront = np.zeros_like(R)                   # aberrations, in waves (see below)
field = pupil * np.exp(2j * np.pi * wavefront)

E = np.fft.fftshift(np.fft.fft2(field, s=(Q * N, Q * N)))
psf = np.abs(E) ** 2
psf /= psf.sum()                               # one pixel = λ/(Q·D) radians
```

Two numbers control the result, and the scaling property links them:

- The **padding factor** $$Q$$ sets the sampling of the PSF: one output pixel is $$\lambda/(QD)$$ radians. The finest detail in a PSF has a period of $$\lambda/D$$, so it takes $$Q \ge 2$$ to sample it properly (the Nyquist criterion).
- The **pupil sampling** $$N$$ sets the field of view: the output spans $$N\lambda/D$$. More samples across the pupil buy a larger patch of sky, and they are also needed to resolve fine features such as thin vanes.

The figures in this post use a *matrix Fourier transform* instead of the FFT[^soummer]. It computes the same sum but lets you choose the output pixel size and field of view freely, which is handy when you want the PSF directly on the pixel grid of a given camera. Libraries such as POPPY[^poppy] implement both.

<details class="math-box" markdown="1">
<summary markdown="span"><span class="math-box__tag">Math refresher</span> From integrals to arrays: the discrete Fourier transform</summary>

The discrete Fourier transform (DFT) of $$N$$ samples $$f_n$$ is

$$
F_k = \sum_{n=0}^{N-1} f_n\, e^{-i2\pi kn/N}, \qquad k = 0,\dots,N-1,
$$

the Fourier integral with the integral replaced by a sum. The FFT is simply a fast algorithm for it, using about $$N\log N$$ operations instead of $$N^2$$. Three practical details matter here:

1. If the samples are spaced by $$\Delta x$$, output $$k$$ corresponds to the frequency $$k/(N\Delta x)$$. Padding with zeros increases $$N$$ without changing $$\Delta x$$, so it gives a finer frequency grid: a finer PSF sampling.
2. The zero frequency comes out at index 0; `np.fft.fftshift` moves it to the centre of the array.
3. The DFT treats its input as periodic, so the PSF repeats every $$N\lambda/D$$, and anything wider than that folds back into the image (aliasing).
</details>

### The secondary mirror

Most astronomical telescopes are reflectors, and a reflector has a secondary mirror sitting in front of the primary, blocking the centre of the beam. The pupil becomes an annulus. By linearity its field is the field of the full disk minus the field of the small disk in the middle:

$$
E(v) \propto \frac{2J_1(v)}{v} - \epsilon^2\,\frac{2J_1(\epsilon v)}{\epsilon v},
$$

where $$\epsilon$$ is the obstruction ratio, the diameter of the secondary divided by that of the primary. The small disk has a wide pattern (scaling, again), and subtracting it moves light out of the core and into the rings.

<figure class="bw" data-bw-json="{{ fs }}/data.json">
<img class="bw__img" data-bw-src="{{ fs }}/obstruction/obstruction_{e}.webp" src="{{ fs }}/obstruction/obstruction_3.webp" alt="Pupil with a central obstruction, the resulting star and its radial profile" width="1440" height="510">
<div class="bw__controls">
<label class="bw-slider">
<span class="bw-slider__head"><span>Central obstruction \(\epsilon\)</span><output data-bw-show="e"></output></span>
<input type="range" data-bw-key="e" min="0" max="5" value="3" data-bw-labels="0%|10%|20%|30%|40%|50%" aria-label="Central obstruction">
</label>
</div>
<div class="bw-readouts">
<span>First dark ring <b><output data-bw-text="obstruction.{e}.zero"></output> \(\lambda/D\)</b></span>
<span>Light inside it <b><output data-bw-text="obstruction.{e}.core"></output>%</b></span>
</div>
<figcaption>Pupil, star (logarithmic display) and radial profile for central obstructions from 0 to 50% of the diameter. The profiles are normalised so that an unobstructed star with the same total light peaks at 1. The core gets slightly narrower, but it hands a growing share of the light to the rings.</figcaption>
</figure>

## Diffraction spikes

The secondary mirror has to be held in place, usually by a *spider*: thin metal vanes running from the secondary to the tube. Those vanes are responsible for the most recognisable feature of astrophotos, the diffraction spikes.

Linearity once more: the pupil is the annulus minus the vanes, so the field is the annulus' field minus the field of each vane. A vane is a long, thin rectangle of length $$L$$ and width $$w$$, and the Fourier transform of a rectangle is a product of two sincs,

$$
\hat P_\text{vane}(k_\parallel, k_\perp) = L\,w\;\mathrm{sinc}(L\,k_\parallel)\;\mathrm{sinc}(w\,k_\perp),
$$

narrow (about $$1/L$$ wide) along the vane and broad (about $$1/w$$) across it. On the sky this is a thin streak of light perpendicular to the vane: a spike. The thinner the vane, the longer and fainter its spike, which reaches out to roughly $$\lambda/w$$. The light it carries is about the fraction of the mirror that the vane covers.

Spikes come in pairs pointing in opposite directions, because the PSF of an unaberrated pupil is symmetric: $$P$$ is real, so $$E(-\boldsymbol\theta) = E(\boldsymbol\theta)^*$$ and the intensity is the same at $$\boldsymbol\theta$$ and $$-\boldsymbol\theta$$. Two vanes on the same line therefore make the *same* pair of spikes. This gives a neat rule: **$$N$$ evenly spaced straight vanes make $$N$$ spikes if $$N$$ is even, and $$2N$$ spikes if $$N$$ is odd.** A classic four-vane spider makes four spikes, a three-vane spider makes six. Hubble's stars have four spikes from its four-vane spider; JWST's have six big ones from the edges of its hexagonal mirror segments, plus two faint ones from a support strut. The same rule explains the "sunstars" of daytime photography, where the aperture blades of a lens play the role of the vanes: a lens with seven blades makes fourteen-pointed stars.

<figure class="bw" data-bw-json="{{ fs }}/data.json">
<div class="bw__stage">
<div class="bw__panel bw__panel--pupil">
<span class="bw__label">Pupil</span>
<img data-bw-src="{{ fs }}/spikes/pupil_{kind}_{w}.webp" src="{{ fs }}/spikes/pupil_cross_1.webp" alt="The telescope pupil with its spider vanes" width="240" height="240">
</div>
<div class="bw__panel">
<span class="bw__label">Star, &plusmn;50 &lambda;/D</span>
<img data-bw-src="{{ fs }}/spikes/psf_{kind}_{w}.webp" src="{{ fs }}/spikes/psf_cross_1.webp" alt="The star produced by that pupil, with diffraction spikes" width="401" height="401">
</div>
</div>
<div class="bw__controls">
<div class="bw-toggle" role="radiogroup" aria-label="Spider">
<label><input type="radio" name="fs-spider" data-bw-key="kind" value="cross" checked><span>4 vanes</span></label>
<label><input type="radio" name="fs-spider" data-bw-key="kind" value="tripod"><span>3 vanes</span></label>
<label><input type="radio" name="fs-spider" data-bw-key="kind" value="curved"><span>3 curved vanes</span></label>
</div>
<label class="bw-slider">
<span class="bw-slider__head"><span>Vane width</span><output data-bw-show="w"></output></span>
<input type="range" data-bw-key="w" min="0" max="3" value="1" data-bw-labels="0.5% of D|1% of D|2% of D|4% of D" aria-label="Vane width">
</label>
</div>
<div class="bw-readouts">
<span>The vanes cover <b><output data-bw-text="spikes.blocked.{kind}_{w}"></output>%</b> of the mirror</span>
</div>
<figcaption>Monochromatic star (logarithmic display) over &plusmn;50&nbsp;\(\lambda/D\), with a 30% central obstruction. Thin vanes make long, faint spikes; thick vanes make short, bright ones. Curved vanes spread the same light into a faint halo instead.</figcaption>
</figure>

Curved vanes are a trick some telescope makers use. The light diffracted by a piece of vane leaves perpendicular to it, so a vane whose direction keeps changing spreads its light over many angles, and the spikes melt into a faint halo. The light is not gone (Parseval again), it is only spread where the eye notices it less. And spikes can be useful too: a Bahtinov mask, placed in front of the telescope while focusing, turns a star into three spikes, and the middle one sits exactly halfway between the other two only when the star is in focus.

## Aberrations and Zernike polynomials

So far the telescope has been perfect: every path from the aperture to the focus has the same length. Real optics are not. A mirror polished slightly too deep in the middle, a lens a few micrometres out of place, or a camera tilted with respect to the optical axis all make some paths longer than others. We describe this with the *wavefront error* $$W(x,y)$$, the extra optical path at each point of the pupil, which enters the pupil function as a phase:

$$
P(x,y) = A(x,y)\; e^{i2\pi W(x,y)/\lambda},
$$

where $$A$$ is the transmission of the aperture, the zeros and ones from before. Measuring $$W$$ in waves (units of $$\lambda$$) turns the phase into simply $$2\pi W$$.

$$W$$ is a function on a disk, and the natural way to describe it is as a sum of standard shapes, in the same way a Fourier series describes a function on an interval as a sum of sines and cosines. For circular pupils, the standard shapes are the Zernike polynomials.

<details class="math-box" markdown="1">
<summary markdown="span"><span class="math-box__tag">Math refresher</span> Polar coordinates and orthonormal bases</summary>

On a disk it is natural to use polar coordinates: $$\rho$$ is the distance from the centre, as a fraction of the radius, and $$\phi$$ is the angle. A small patch of the disk has area $$\rho\,d\rho\,d\phi$$.

Think of functions on the unit disk as vectors, and define their dot product as the average of their product over the disk:

$$
\langle f, g\rangle = \frac{1}{\pi}\int_0^{2\pi}\!\!\int_0^1 f(\rho,\phi)\,g(\rho,\phi)\;\rho\,d\rho\,d\phi .
$$

A family of functions $$Z_j$$ is *orthonormal* if $$\langle Z_j, Z_j\rangle = 1$$ for every $$j$$ and $$\langle Z_i, Z_j\rangle = 0$$ for every pair $$i \ne j$$, just like the $$x$$, $$y$$ and $$z$$ axes of space. In such a basis the coefficients of a function are easy to find, $$a_j = \langle W, Z_j\rangle$$, and so is its size: by Pythagoras, the root-mean-square (RMS) value of $$W = \sum_j a_j Z_j$$ is $$\sqrt{\sum_j a_j^2}$$.
</details>

Zernike polynomials are labelled by a radial order $$n$$ and an azimuthal frequency $$m$$, where $$n - \lvert m\rvert$$ is even and non-negative:

$$
Z_n^m(\rho,\phi) = N_n^m\, R_n^{\lvert m\rvert}(\rho)\times
\begin{cases}
\cos(m\phi) & m \ge 0,\\
\sin(\lvert m\rvert\phi) & m < 0,
\end{cases}
$$

with the radial polynomial

$$
R_n^{m}(\rho) = \sum_{k=0}^{(n-m)/2} \frac{(-1)^k\,(n-k)!}{k!\,\left(\frac{n+m}{2}-k\right)!\,\left(\frac{n-m}{2}-k\right)!}\;\rho^{\,n-2k}
$$

and the normalisation $$N_n^m = \sqrt{2(n+1)/(1+\delta_{m0})}$$ that makes them orthonormal. They are usually numbered with a single index $$j$$ following Noll's convention[^noll], and the first few have names every optician knows:

| Noll $$j$$ | Name | Shape | Typical cause |
|:--|:--|:--|:--|
| 1 | Piston | $$1$$ | A constant delay: invisible |
| 2, 3 | Tilt | $$2\rho\cos\phi,\ 2\rho\sin\phi$$ | Pointing and tracking errors: the star moves |
| 4 | Defocus | $$\sqrt{3}\,(2\rho^2-1)$$ | Focus error, temperature changes |
| 5, 6 | Astigmatism | $$\sqrt{6}\,\rho^2\sin 2\phi,\ \sqrt{6}\,\rho^2\cos 2\phi$$ | Pinched or tilted optics, stars far off-axis |
| 7, 8 | Coma | $$\sqrt{8}\,(3\rho^3-2\rho)\sin\phi,\ \ldots\cos\phi$$ | Miscollimation, off-axis stars in a Newtonian |
| 9, 10 | Trefoil | $$\sqrt{8}\,\rho^3\sin 3\phi,\ \sqrt{8}\,\rho^3\cos 3\phi$$ | Mirror squeezed by three support clips |
| 11 | Spherical | $$\sqrt{5}\,(6\rho^4-6\rho^2+1)$$ | Mirror figured too deep or too shallow |

With this normalisation each coefficient $$a_j$$ is directly the RMS wavefront error, in waves, contributed by that shape, and the total RMS error is the square root of the sum of their squares (leaving out piston, which does nothing).

How bad is a given error? The standard measure is the *Strehl ratio* $$S$$: the peak intensity of the aberrated star divided by that of a perfect one. For small errors, the Maréchal approximation links the two,

$$
S \approx e^{-(2\pi\sigma_W)^2},
$$

where $$\sigma_W$$ is the RMS wavefront error in waves. Optics are called *diffraction limited* when $$S \ge 0.8$$, which means $$\sigma_W \lesssim \lambda/14$$: about 40 nanometres in green light. Since reflection doubles any error on a mirror's surface, the surface has to be accurate to about 20&nbsp;nm.

<figure class="bw" data-bw-json="{{ fs }}/data.json">
<div class="bw-pyramid" role="radiogroup" aria-label="Zernike polynomial">
<div class="bw-pyramid__row">
<label class="bw-chip"><input type="radio" name="fs-zernike" data-bw-key="j" value="1" data-bw-label="Piston"><img src="{{ fs }}/zernike/thumb_1.webp" alt="" width="112" height="112"><span>j = 1</span></label>
</div>
<div class="bw-pyramid__row">
<label class="bw-chip"><input type="radio" name="fs-zernike" data-bw-key="j" value="3" data-bw-label="Tilt (y)"><img src="{{ fs }}/zernike/thumb_3.webp" alt="" width="112" height="112"><span>j = 3</span></label>
<label class="bw-chip"><input type="radio" name="fs-zernike" data-bw-key="j" value="2" data-bw-label="Tilt (x)"><img src="{{ fs }}/zernike/thumb_2.webp" alt="" width="112" height="112"><span>j = 2</span></label>
</div>
<div class="bw-pyramid__row">
<label class="bw-chip"><input type="radio" name="fs-zernike" data-bw-key="j" value="5" data-bw-label="Astigmatism (oblique)"><img src="{{ fs }}/zernike/thumb_5.webp" alt="" width="112" height="112"><span>j = 5</span></label>
<label class="bw-chip"><input type="radio" name="fs-zernike" data-bw-key="j" value="4" data-bw-label="Defocus"><img src="{{ fs }}/zernike/thumb_4.webp" alt="" width="112" height="112"><span>j = 4</span></label>
<label class="bw-chip"><input type="radio" name="fs-zernike" data-bw-key="j" value="6" data-bw-label="Astigmatism (vertical)"><img src="{{ fs }}/zernike/thumb_6.webp" alt="" width="112" height="112"><span>j = 6</span></label>
</div>
<div class="bw-pyramid__row">
<label class="bw-chip"><input type="radio" name="fs-zernike" data-bw-key="j" value="9" data-bw-label="Trefoil (vertical)"><img src="{{ fs }}/zernike/thumb_9.webp" alt="" width="112" height="112"><span>j = 9</span></label>
<label class="bw-chip"><input type="radio" name="fs-zernike" data-bw-key="j" value="7" data-bw-label="Coma (vertical)"><img src="{{ fs }}/zernike/thumb_7.webp" alt="" width="112" height="112"><span>j = 7</span></label>
<label class="bw-chip"><input type="radio" name="fs-zernike" data-bw-key="j" value="8" data-bw-label="Coma (horizontal)" checked><img src="{{ fs }}/zernike/thumb_8.webp" alt="" width="112" height="112"><span>j = 8</span></label>
<label class="bw-chip"><input type="radio" name="fs-zernike" data-bw-key="j" value="10" data-bw-label="Trefoil (oblique)"><img src="{{ fs }}/zernike/thumb_10.webp" alt="" width="112" height="112"><span>j = 10</span></label>
</div>
<div class="bw-pyramid__row">
<label class="bw-chip"><input type="radio" name="fs-zernike" data-bw-key="j" value="15" data-bw-label="Quadrafoil (oblique)"><img src="{{ fs }}/zernike/thumb_15.webp" alt="" width="112" height="112"><span>j = 15</span></label>
<label class="bw-chip"><input type="radio" name="fs-zernike" data-bw-key="j" value="13" data-bw-label="Secondary astigmatism (oblique)"><img src="{{ fs }}/zernike/thumb_13.webp" alt="" width="112" height="112"><span>j = 13</span></label>
<label class="bw-chip"><input type="radio" name="fs-zernike" data-bw-key="j" value="11" data-bw-label="Primary spherical"><img src="{{ fs }}/zernike/thumb_11.webp" alt="" width="112" height="112"><span>j = 11</span></label>
<label class="bw-chip"><input type="radio" name="fs-zernike" data-bw-key="j" value="12" data-bw-label="Secondary astigmatism (vertical)"><img src="{{ fs }}/zernike/thumb_12.webp" alt="" width="112" height="112"><span>j = 12</span></label>
<label class="bw-chip"><input type="radio" name="fs-zernike" data-bw-key="j" value="14" data-bw-label="Quadrafoil (vertical)"><img src="{{ fs }}/zernike/thumb_14.webp" alt="" width="112" height="112"><span>j = 14</span></label>
</div>
</div>
<div class="bw__stage">
<div class="bw__panel bw__panel--pupil">
<span class="bw__label">Wavefront error</span>
<img data-bw-src="{{ fs }}/zernike/wf_{j}_{a}.webp" src="{{ fs }}/zernike/wf_8_3.webp" alt="The wavefront error over the pupil" width="260" height="260">
</div>
<div class="bw__panel">
<span class="bw__label">Star, &plusmn;12 &lambda;/D</span>
<img data-bw-src="{{ fs }}/zernike/psf_{j}_{a}.webp" src="{{ fs }}/zernike/psf_8_3.webp" alt="The star produced by that wavefront" width="321" height="321">
</div>
</div>
<div class="bw__controls">
<label class="bw-slider">
<span class="bw-slider__head"><span>Amplitude \(a_j\) (RMS)</span><output data-bw-show="a"></output></span>
<input type="range" data-bw-key="a" min="0" max="4" value="3" data-bw-labels="0|0.07 waves|0.15 waves|0.30 waves|0.50 waves" aria-label="Amplitude of the Zernike polynomial">
</label>
</div>
<div class="bw-readouts">
<span><b><output data-bw-show="j"></output></b> <output data-bw-text="zernike.nm.{j}" data-bw-html></output></span>
<span>Strehl ratio <b><output data-bw-text="zernike.strehl.{j}_{a}"></output></b></span>
</div>
<figcaption>Pick a polynomial in the pyramid (one row per radial order \(n\), from 0 to 4) and set its amplitude. The wavefront error is drawn across a clear circular pupil, red where the wave is ahead and blue where it lags, saturating at &plusmn;1 wave. The star is normalised to the peak of a perfect star and shown in a logarithmic display.</figcaption>
</figure>

A few things worth trying. Tilt ($$j = 2, 3$$) only moves the star, as the shift property promised, and its Strehl ratio stays at 1. Defocus and spherical aberration keep the star round but pump light into the rings. Astigmatism stretches the star into a cross, coma gives it the comet-like tail it is named after, and trefoil makes the triangular stars that betray a mirror pinched by its three support clips.

Large aberrations take us from wave optics back to ray optics. Defocus a star by several waves and its image becomes a shadow of the pupil: a bright ring with a hole in the middle (the secondary mirror) and the spider vanes running across it. It is the doughnut every astrophotographer has stared at while focusing.

<figure class="bw bw--anim">
<img src="{{ fs }}/gifs/through_focus.gif" alt="Animation of a star going out of focus: a point grows into a ring crossed by the shadows of the spider vanes" width="281" height="281" loading="lazy">
<figcaption>The same reflector going from perfect focus to 8 waves RMS of defocus and back, in white light (square-root display, normalised frame by frame).</figcaption>
</figure>

## Everything at once: the PSF explorer

Here is everything together. The sliders change the aperture of the telescope, the spider (and with it the number of spikes) and three aberrations. Every combination, 1&#8239;600 of them, was computed in advance with the method above.

<figure class="bw" data-bw-json="{{ fs }}/data.json">
<div class="bw__stage">
<div class="bw__panel bw__panel--pupil">
<span class="bw__label">Pupil and wavefront</span>
<div class="bw-stack">
<img data-bw-src="{{ fs }}/explorer/phase_{f}_{a}_{c}.webp" src="{{ fs }}/explorer/phase_0_0_0.webp" alt="The wavefront error over the pupil" width="240" height="240">
<img data-bw-src="{{ fs }}/explorer/mask_{s}.webp" src="{{ fs }}/explorer/mask_2.webp" alt="" width="240" height="240">
</div>
</div>
<div class="bw__panel">
<span class="bw__label">Star, 40″ &times; 40″</span>
<img data-bw-src="{{ fs }}/explorer/psf_{d}_{s}_{f}_{a}_{c}.webp" src="{{ fs }}/explorer/psf_2_2_0_0_0.webp" alt="The simulated star for the chosen telescope" width="401" height="401">
</div>
</div>
<div class="bw__controls bw__controls--grid">
<label class="bw-slider">
<span class="bw-slider__head"><span>Aperture \(D\)</span><output data-bw-show="d"></output></span>
<input type="range" data-bw-key="d" min="0" max="4" value="2" data-bw-labels="80 mm|130 mm|200 mm|300 mm|400 mm" aria-label="Aperture">
</label>
<label class="bw-slider">
<span class="bw-slider__head"><span>Spikes</span><output data-bw-show="s"></output></span>
<input type="range" data-bw-key="s" min="0" max="4" value="2" data-bw-labels="0 (no spider)|2 (one bar)|4 (four vanes)|6 (three vanes)|8 (eight vanes)" aria-label="Number of spikes">
</label>
<label class="bw-slider">
<span class="bw-slider__head"><span>Defocus \(Z_4\)</span><output data-bw-show="f"></output></span>
<input type="range" data-bw-key="f" min="0" max="3" value="0" data-bw-labels="0|0.07 waves|0.15 waves|0.30 waves" aria-label="Defocus">
</label>
<label class="bw-slider">
<span class="bw-slider__head"><span>Astigmatism \(Z_5\)</span><output data-bw-show="a"></output></span>
<input type="range" data-bw-key="a" min="0" max="3" value="0" data-bw-labels="0|0.07 waves|0.15 waves|0.30 waves" aria-label="Astigmatism">
</label>
<label class="bw-slider">
<span class="bw-slider__head"><span>Coma \((Z_7+Z_8)/\sqrt2\)</span><output data-bw-show="c"></output></span>
<input type="range" data-bw-key="c" min="0" max="3" value="0" data-bw-labels="0|0.07 waves|0.15 waves|0.30 waves" aria-label="Coma">
</label>
</div>
<div class="bw-readouts">
<span>\(\lambda/D\) <b><output data-bw-text="explorer.res.{d}"></output></b></span>
<span>RMS wavefront error <b><output data-bw-text="explorer.rms.{f}_{a}_{c}" data-bw-digits="3"></output> waves</b></span>
<span>Strehl ratio <b><output data-bw-text="explorer.strehl.{s}_{f}_{a}_{c}"></output></b></span>
</div>
<figcaption>Monochromatic star at 550&nbsp;nm over a 40″ field, in a logarithmic display normalised to the peak of a perfect star of the same telescope. The secondary mirror blocks 30% of the diameter and the vanes are 1% of the diameter wide. Coma points along the diagonal so it does not hide behind the spikes. The RMS error is measured over the real, obstructed pupil, which is why it differs slightly from the slider values.</figcaption>
</figure>

Notice that the aperture slider only changes the scale. In units of $$\lambda/D$$ the star is the same for every telescope (the scaling property), but a bigger mirror shrinks everything on the sky, including the damage done by a given aberration in waves.

## Making it look real

A monochromatic PSF is the heart of a realistic star, but three more ingredients separate it from what a camera actually records.

### White light

Stars are not monochromatic. Since the PSF scales with $$\lambda/D$$, red light makes a bigger pattern than blue light:

<figure class="bw bw--anim">
<img src="{{ fs }}/gifs/wavelength.gif" alt="Animation of the same star at wavelengths from 400 to 700 nanometres, growing as the wavelength increases" width="241" height="241" loading="lazy">
<figcaption>The same telescope from 400 to 700&nbsp;nm, on a fixed angular scale: the whole pattern, spikes included, grows in proportion to the wavelength.</figcaption>
</figure>

A colour camera adds up the patterns of all wavelengths, weighted by the spectrum of the star $$S(\lambda)$$ and by the response $$R_c(\lambda)$$ of each colour channel $$c$$:

$$
\mathrm{PSF}_c(\boldsymbol\theta) = \int S(\lambda)\,R_c(\lambda)\,\mathrm{PSF}_\lambda(\boldsymbol\theta)\,d\lambda .
$$

The rings sit at different radii for different wavelengths, so they blur into a smooth halo, and the spikes pick up a colour gradient, bluer close to the star and redder further out.

<figure class="bw">
<div class="bw__bar">
<div class="bw-toggle" role="radiogroup" aria-label="Light">
<label><input type="radio" name="fs-colour" data-bw-key="light" value="mono" checked><span>Monochromatic (550 nm)</span></label>
<label><input type="radio" name="fs-colour" data-bw-key="light" value="white"><span>White light</span></label>
</div>
</div>
<img class="bw__img bw__img--square" data-bw-src="{{ fs }}/colour/{light}.webp" src="{{ fs }}/colour/mono.webp" alt="The star in monochromatic light and in white light" width="401" height="401">
<figcaption>The same telescope in monochromatic light and in the light of a sun-like star (a 5800&nbsp;K black body) seen through red, green and blue filters, over &plusmn;16&nbsp;\(\lambda/D\). Each colour channel gets the same logarithmic stretch.</figcaption>
</figure>

### The atmosphere

From the ground, starlight also crosses a few kilometres of turbulent air, which distorts the wavefront randomly and much faster than a typical exposure. Averaged over a long exposure, the effect is a blur whose *transfer function* (the Fourier transform of the blur) is, for Kolmogorov turbulence[^fried],

$$
T_\text{atm}(f) = \exp\left[-3.44\left(\frac{\lambda f}{r_0}\right)^{5/3}\right],
$$

where $$f$$ is the angular frequency in cycles per radian and $$r_0$$, the Fried parameter, is typically 5 to 15 centimetres in visible light. The seeing FWHM is about $$0.98\,\lambda/r_0$$. The final PSF is the telescope's PSF convolved with this blur, which in Fourier space is just a product.

<details class="math-box" markdown="1">
<summary markdown="span"><span class="math-box__tag">Math refresher</span> Convolution and the convolution theorem</summary>

Blurring an image $$I$$ with a kernel $$K$$ is a *convolution*: every point of $$I$$ is replaced by a copy of $$K$$, scaled by the brightness of that point,

$$
(I * K)(\boldsymbol\theta) = \iint I(\boldsymbol\theta')\,K(\boldsymbol\theta - \boldsymbol\theta')\;d^2\theta' .
$$

Convolutions are expensive to compute directly and cheap in Fourier space, because the transform of a convolution is the product of the transforms: $$\widehat{I * K} = \hat I\,\hat K$$. Two blurs in a row simply multiply their transfer functions. This is also why every astronomical image is the true sky convolved with the PSF, and why undoing that blur (*deconvolution*) is hard: wherever $$\hat K$$ is close to zero, the information is gone.
</details>

This is where the Gaussian recipe comes from. With a large telescope under poor seeing, the core of a star really does look like a Gaussian blob; more precisely, the long-exposure Kolmogorov PSF is best matched by a Moffat profile with $$\beta \approx 4.8$$[^trujillo]. **The Gaussian is not wrong, it is incomplete:** it describes the atmosphere and forgets the telescope. The halo, the spikes, the colours and the aberrations are all still there, just as in the image at the top.

### Pixels and noise

Last comes the camera. The PSF has to be integrated over each pixel: render it on a finer grid, then sum blocks of sub-pixels. Stars land at random sub-pixel positions. And the image picks up noise: *photon noise*, because light arrives as a Poisson process and a pixel expecting $$N$$ photons gets $$N \pm \sqrt{N}$$; *read noise* from the electronics; and *saturation*, since a pixel cannot hold more than its full-well capacity, which flattens the cores of bright stars.

## The recipe

1. **Describe the pupil**: aperture, central obstruction and spider vanes, as an array of zeros and ones (anti-aliased at the edges, or the jagged pixels will make spikes of their own).
2. **Add the aberrations**: a wavefront error built from Zernike polynomials, and the pupil function $$P = A\,e^{i2\pi W}$$ with $$W$$ in waves.
3. **Fourier transform and square**: $$\mathrm{PSF} = \lvert\mathcal{F}\{P\}\rvert^2$$, with enough padding to sample the PSF at least twice per $$\lambda/D$$.
4. **Repeat over wavelength**: sum the PSFs, weighted by the spectrum of the star and the camera's filters.
5. **Add the atmosphere** (from the ground): multiply by $$T_\text{atm}$$ in Fourier space.
6. **Build the image**: integrate over pixels, place stars at random sub-pixel positions with realistic fluxes and colours, then add sky background, photon noise, read noise and saturation.

That is exactly how the right-hand image at the top was made. Scroll back up and drag the slider again: you should now be able to name every difference.

None of this is new optics. It is all in textbooks, and professional simulation codes such as POPPY[^poppy] and GalSim[^galsim] model obscurations, struts and Zernike aberrations in exactly this way. But it rarely reaches the tutorials people actually copy when they need fake stars, and it makes a real difference when those fake stars are going to teach a neural network what the sky looks like.

## References

[^ccd-guide]: Astropy Project, *CCD Data Reduction Guide*, ["Construction of an artificial (but realistic) image"](https://www.astropy.org/ccd-reduction-and-photometry-guide/v/dev/notebooks/01-03-Construction-of-an-artificial-but-realistic-image.html).

[^photutils]: photutils documentation, [`make_psf_model_image`](https://photutils.readthedocs.io/en/stable/api/photutils.psf.make_psf_model_image.html).

[^synthetic]: Learn Astropy, ["Synthetic Images from simulated data"](https://learn.astropy.org/tutorials/synthetic-images.html).

[^moffat]: A. F. J. Moffat, "A theoretical investigation of focal stellar images in the photographic emulsion and application to photographic photometry", *Astronomy & Astrophysics* 3, 455 (1969).

[^goodman]: J. W. Goodman, *Introduction to Fourier Optics*, 4th edition, W. H. Freeman (2017).

[^soummer]: R. Soummer, L. Pueyo, A. Sivaramakrishnan and R. J. Vanderbei, "Fast computation of Lyot-style coronagraph propagation", *Optics Express* 15, 15935 (2007).

[^poppy]: [POPPY: Physical Optics Propagation in Python](https://poppy-optics.readthedocs.io/).

[^noll]: R. J. Noll, "Zernike polynomials and atmospheric turbulence", *Journal of the Optical Society of America* 66, 207 (1976).

[^fried]: D. L. Fried, "Optical resolution through a randomly inhomogeneous medium for very long and very short exposures", *Journal of the Optical Society of America* 56, 1372 (1966).

[^trujillo]: I. Trujillo, J. A. L. Aguerri, J. Cepa and C. M. Gutiérrez, "The effects of seeing on Sérsic profiles – II. The Moffat PSF", *Monthly Notices of the Royal Astronomical Society* 328, 977 (2001).

[^galsim]: B. Rowe et al., ["GalSim: The modular galaxy image simulation toolkit"](https://arxiv.org/abs/1407.7676), *Astronomy and Computing* 10, 121 (2015).
