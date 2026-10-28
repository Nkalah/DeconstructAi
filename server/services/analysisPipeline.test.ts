import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSvgPosterText, parseSvgPosterVisuals } from './svgPosterText';
import { runAnalysisPipeline } from './analysisPipeline';

describe('local SVG poster text decomposition', () => {
  it('does not create a synthetic raster poster when no AI provider is configured', async () => {
    const previousKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      await assert.rejects(
        runAnalysisPipeline({
          designId: 'missing-provider-raster',
          imagePayload: 'data:image/png;base64,iVBORw0KGgo=',
          canvasWidth: 800,
          canvasHeight: 1000
        }),
        /Raster poster analysis requires GEMINI_API_KEY\. No synthetic reconstruction was created\./
      );
    } finally {
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
    }
  });

  it('uses source typography, baseline position, anchor, and decoded text', () => {
    const svg = `<svg viewBox="0 0 1080 1350">
      <text font-size="16" text-anchor="middle" font-family="Montserrat, sans-serif" x="210" y="135" fill="#ffffff" font-weight="700" letter-spacing="3">ANNUAL KEYNOTE</text>
      <text y="325" x="120" font-size="22" fill="#94a3b8" font-family="Inter, sans-serif">Autonomous Intelligence, Human Interfaces &amp; Compute</text>
      <text x="120" y="220" font-size="64" font-family="Montserrat, sans-serif" font-weight="900">FUTURE AI</text>
    </svg>`;
    const [badge, subtitle, headline] = parseSvgPosterText(svg, 1080, 1350);

    assert.equal(badge.content, 'ANNUAL KEYNOTE');
    assert.equal(badge.font_size, 16);
    assert.equal(badge.alignment, 'center');
    const badgeLeft = (badge.bbox[1] / 1000) * 1080;
    const badgeWidth = ((badge.bbox[3] - badge.bbox[1]) / 1000) * 1080;
    assert.ok(Math.abs(badgeLeft + badgeWidth / 2 - 210) < 2);
    assert.ok(Math.abs((badge.bbox[0] / 1000) * 1350 - (135 - 16 * 0.88)) < 2);
    assert.equal(subtitle.content, 'Autonomous Intelligence, Human Interfaces & Compute');
    assert.equal(subtitle.font_size, 22);
    assert.equal(headline.font_size, 64);
    assert.ok(((headline.bbox[3] - headline.bbox[1]) / 1000) * 1080 >= 400);
  });

  describe('local SVG poster visual decomposition', () => {
    it('extracts the source gradient, clipped visual, and actual shape geometry', () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1200">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#000000"/><stop offset="100%" stop-color="#333366"/></linearGradient>
          <clipPath id="hero"><circle cx="500" cy="400" r="180"/></clipPath>
        </defs>
        <rect width="1000" height="1200" fill="url(#bg)"/>
        <rect x="100" y="800" width="800" height="200" rx="20" fill="#112233" fill-opacity=".8"/>
        <g clip-path="url(#hero)"><rect x="300" y="200" width="400" height="400" fill="#ffffff"/></g>
      </svg>`;
      const result = parseSvgPosterVisuals(svg, 1000, 1200);

      assert.equal(result.background.fill_type, 'linear_gradient');
      assert.equal(result.background.primary_color, '#000000');
      assert.deepEqual(result.shape_layers[0].bbox, [667, 100, 833, 900]);
      assert.equal(result.shape_layers[0].opacity, 0.8);
      assert.deepEqual(result.image_layers[0].bbox, [167, 300, 500, 700]);
      assert.match(result.image_layers[0].image_url, /^data:image\/svg\+xml/);
    });
  });
});
