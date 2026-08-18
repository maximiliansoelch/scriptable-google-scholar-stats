// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: graduation-cap;

// Google Scholar Stats — Scriptable widget
// https://github.com/maximiliansoelch/scriptable-google-scholar-stats
//
// Copyright (c) 2026 Maximilian Sölch
// SPDX-License-Identifier: MIT
//
// Widget parameter: either a Scholar user ID ("wFmJp2sAAAAJ")
// or a full profile URL ("https://scholar.google.com/citations?user=wFmJp2sAAAAJ&hl=en")

// Fallback for the widget parameter, handy for previewing in-app.
const DEFAULT_PROFILE = "";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RETRY_INTERVAL_MS = 30 * 60 * 1000;

// Roughly the window Scholar's own histogram shows; the medium chart shares its
// row with the numbers, so it shows fewer years to keep the bars comparable.
const MAX_CHART_YEARS = 8;
const MEDIUM_CHART_YEARS = 6;
const TOP_PUBLICATION_COUNT = 3;

const LABEL_WIDTH = 34; // a four-digit year at 9pt, plus room to breathe
const CHART_INSET = 6;
const MAX_BAR_WIDTH = 42;
// A share of the bar's width, so roundness looks the same however wide the bars
// are, but capped — a sparse chart's wide bars would otherwise take a radius
// near half their height and round their ends into a capsule.
const BAR_CORNER_RATIO = 0.4;
const MAX_BAR_CORNER = 11;

// Baked into a bitmap, so these cannot be dynamic — they have to read on both
// light and dark backgrounds.
const ACCENT_HEX = "#4285F4";
const ACCENT_COLOR = new Color(ACCENT_HEX);
const CHART_LABEL_COLOR = new Color("#8E8E93");

// Pinned so a scaled-down value cannot shrink its chip or shift its label out
// of line with the neighbouring ones.
const CHIP_HEIGHT = 38;
const CHIP_VALUE_HEIGHT = 19;

const MUTED_COLOR = Color.gray();
const DIVIDER_COLOR = Color.dynamic(
  new Color("#000000", 0.12),
  new Color("#FFFFFF", 0.14)
);
const CHIP_BACKGROUND = Color.dynamic(
  new Color("#000000", 0.05),
  new Color("#FFFFFF", 0.08)
);

const profileInput = (args.widgetParameter || DEFAULT_PROFILE).trim();
const idInUrl = profileInput.match(/[?&]user=([^&#\s]+)/);
const scholarId = idInUrl ? idInUrl[1] : profileInput;

const widgetFamily = config.widgetFamily || "medium";
const isSmall = widgetFamily === "small";
const isMedium = widgetFamily === "medium";
const isLarge = widgetFamily === "large" || widgetFamily === "extraLarge";

// Characters that fit beside the avatar before the name starts eliding.
const NAME_LIMIT = isSmall ? 20 : 30;

function profileUrl(id) {
  return `https://scholar.google.com/citations?user=${id}&hl=en`;
}

function stripMarkup(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

// A profile without a photo points at Scholar's placeholder with a root-relative
// path, so the src cannot be used as-is.
function findAvatarUrl(html, id) {
  const imageTag = html.match(/<img[^>]*gsc_prf_pup-img[^>]*>/);
  const srcMatch = imageTag && imageTag[0].match(/src="([^"]+)"/);
  if (!srcMatch) {
    return `https://scholar.google.com/citations?view_op=view_photo&user=${id}`;
  }
  const src = srcMatch[1].replace(/&amp;/g, "&");
  return src.startsWith("/") ? `https://scholar.google.com${src}` : src;
}

async function loadAvatar(html, id) {
  try {
    const request = new Request(findAvatarUrl(html, id));
    request.headers = { "User-Agent": USER_AGENT, Referer: profileUrl(id) };
    return Image.fromData(await request.load());
  } catch (error) {
    return null; // decorative — never fail the widget over it
  }
}

// Bars are absolutely positioned and carry no year: their links are
// javascript:void(0), and a year without citations gets no bar at all, so they
// cannot be zipped onto the year labels. The inline style is the only anchor —
// the newest year sits at right:8px and each earlier year steps 32px further.
const BAR_SLOT_BASE = 8;
const BAR_SLOT_STEP = 32;

function yearIndexOfBar(bar, yearCount) {
  const slot = (bar.right - BAR_SLOT_BASE) / BAR_SLOT_STEP;
  if (Math.abs(slot - Math.round(slot)) < 0.01) {
    const index = yearCount - 1 - Math.round(slot);
    if (index >= 0 && index < yearCount) return index;
  }
  // Fallback: z-index counts slots down from the oldest bar, gaps included.
  if (bar.zIndex >= 1 && bar.zIndex <= yearCount) return yearCount - bar.zIndex;
  return -1;
}

function parseYearlyCitations(html) {
  const years = [...html.matchAll(/class="gsc_g_t"[^>]*>(\d{4})</g)]
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
  if (years.length === 0) return [];

  const citationsByYear = new Map();
  for (const [tag] of html.matchAll(/<a[^>]*class="gsc_g_a"[\s\S]*?<\/a>/g)) {
    const bar = {
      right: Number((tag.match(/right:\s*([\d.]+)px/) || [])[1]),
      zIndex: Number((tag.match(/z-index:\s*(\d+)/) || [])[1]),
      citations: Number((tag.match(/class="gsc_g_al"[^>]*>(\d+)</) || [])[1]),
    };
    const index = Number.isFinite(bar.citations)
      ? yearIndexOfBar(bar, years.length)
      : -1;
    if (index >= 0) citationsByYear.set(years[index], bar.citations);
  }

  return years
    .map((year) => ({ year, citations: citationsByYear.get(year) || 0 }))
    .slice(-MAX_CHART_YEARS);
}

function parsePublications(html) {
  return [...html.matchAll(/<tr class="gsc_a_tr">([\s\S]*?)<\/tr>/g)]
    .map(([, row]) => {
      // Titles carry inline markup — Scholar draws maths as an <svg> — so read
      // to the closing tag rather than to the first "<".
      const titleMatch = row.match(/class="gsc_a_at"[^>]*>([\s\S]*?)<\/a>/);
      const citationsMatch = row.match(/class="gsc_a_ac[^"]*"[^>]*>(\d+)</);
      if (!titleMatch) return null;
      return {
        title: decodeEntities(stripMarkup(titleMatch[1])),
        citations: citationsMatch ? Number(citationsMatch[1]) : 0,
      };
    })
    .filter((publication) => publication && publication.title)
    .sort((a, b) => b.citations - a.citations);
}

async function fetchProfileStats(id) {
  const request = new Request(profileUrl(id));
  request.headers = { "User-Agent": USER_AGENT };
  const html = await request.loadString();

  // Cells run: citations all/since, h-index all/since, i10 all/since.
  const tableValues = [...html.matchAll(/gsc_rsb_std">(\d+)</g)].map((match) =>
    Number(match[1])
  );
  if (tableValues.length < 5) throw new Error("Profile not readable");

  const nameMatch = html.match(/id="gsc_prf_in">([^<]+)</);
  // The affiliation is the only gsc_prf_il without an id; its siblings hold the
  // verified email and the interests.
  const affiliationMatch = html.match(/class="gsc_prf_il">([\s\S]*?)<\/div>/);
  // This header is localised ("Since 2021", "Seit 2021", …), so key off the year.
  const sinceYearMatch = html.match(/class="gsc_rsb_sth"[^>]*>[^<]*?(\d{4})<\/th>/);

  return {
    authorName: nameMatch ? decodeEntities(nameMatch[1]) : "Google Scholar",
    affiliation: affiliationMatch
      ? decodeEntities(stripMarkup(affiliationMatch[1]).replace(/\s+([,;.])/g, "$1"))
      : "",
    avatar: await loadAvatar(html, id),
    citations: tableValues[0],
    hIndex: tableValues[2],
    i10Index: tableValues[4],
    recentCitations: tableValues[1],
    sinceYear: sinceYearMatch ? sinceYearMatch[1] : "",
    yearlyCitations: parseYearlyCitations(html),
    publications: parsePublications(html),
  };
}

function formatTimestamp(date) {
  const formatter = new DateFormatter();
  formatter.useShortTimeStyle();
  const time = formatter.string(date);

  if (date.toDateString() === new Date().toDateString()) return time;

  formatter.useShortDateStyle();
  formatter.useNoTimeStyle();
  return `${formatter.string(date)} ${time}`;
}

// "Prof. Dr. Tony Gorschek" is mostly honorifics — drop those, and fall back to
// initials only if the cleaned name still cannot fit.
function displayName(fullName) {
  const honorifics =
    /\b(Prof|Professor|Dr|PhD|Ph\.?D|MSc|M\.Sc|BSc|MD|Dipl|Ing|habil|rer|nat|pol|oec|h\.?c|em|Mr|Ms|Mrs)\b\.?/gi;
  const cleaned = fullName.replace(honorifics, "").replace(/[\s.]+/g, " ").trim();
  const name = cleaned.length > 0 ? cleaned : fullName;

  if (name.length <= NAME_LIMIT) return name;

  const parts = name.split(" ");
  const surname = parts.pop();
  if (parts.length === 0) return surname;
  return `${parts.map((part) => `${part[0]}.`).join(" ")} ${surname}`;
}

function createWidget() {
  const widget = new ListWidget();
  widget.setPadding(14, 14, 14, 14);

  const gradient = new LinearGradient();
  gradient.locations = [0, 1];
  gradient.colors = [
    Color.dynamic(new Color("#FFFFFF"), new Color("#1F1F22")),
    Color.dynamic(new Color("#F1F3F7"), new Color("#111114")),
  ];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  widget.backgroundGradient = gradient;

  return widget;
}

// One path, one fill: a rect plus an ellipse would overlap, and a translucent
// fill darkens wherever it doubles up.
function drawRoundedBar(context, x, y, width, height) {
  const radius = Math.min(width * BAR_CORNER_RATIO, MAX_BAR_CORNER, height / 2);
  const path = new Path();
  path.addRoundedRect(new Rect(x, y, width, height), radius, radius);
  context.addPath(path);
  context.fillPath();
}

function drawCitationChart(yearlyCitations, width, height) {
  const context = new DrawContext();
  context.size = new Size(width, height);
  context.opaque = false;
  context.respectScreenScale = true;

  const labelHeight = 11;
  const plotHeight = height - labelHeight - 3;
  const slot = (width - CHART_INSET * 2) / yearlyCitations.length;
  const barWidth = Math.max(3, Math.min(slot * 0.68, MAX_BAR_WIDTH));
  const peak = Math.max(...yearlyCitations.map((entry) => entry.citations), 1);
  const currentYear = new Date().getFullYear();
  // Counted back from the most recent year, so "now" always gets a tick.
  const labelStep = Math.max(1, Math.ceil(LABEL_WIDTH / slot));

  context.setFont(Font.systemFont(9));
  context.setTextColor(CHART_LABEL_COLOR);
  context.setTextAlignedCenter();

  yearlyCitations.forEach((entry, index) => {
    const center = CHART_INSET + slot * (index + 0.5);

    // The floor keeps a small-but-real year visible; a year with no citations
    // draws nothing, so a gap stays distinguishable from a quiet year.
    if (entry.citations > 0) {
      const barHeight = Math.max(2, (entry.citations / peak) * plotHeight);
      context.setFillColor(
        entry.year === currentYear ? ACCENT_COLOR : new Color(ACCENT_HEX, 0.42)
      );
      drawRoundedBar(
        context,
        center - barWidth / 2,
        plotHeight - barHeight,
        barWidth,
        barHeight
      );
    }

    if ((yearlyCitations.length - 1 - index) % labelStep === 0) {
      context.drawTextInRect(
        String(entry.year),
        new Rect(center - LABEL_WIDTH / 2, plotHeight + 3, LABEL_WIDTH, labelHeight)
      );
    }
  });

  return context.getImage();
}

// Drawn larger than the box it lands in and scaled back down, so it fills the
// box instead of sitting inset. Keeping the canvas wider in proportion than the
// box can be makes the width the binding dimension; the leftover height goes
// above the chart, holding the year labels on the bottom edge.
function addChart(parentStack, yearlyCitations, options) {
  if (yearlyCitations.length === 0) return;

  const container = parentStack.addStack();
  container.size = new Size(0, options.boxHeight); // width 0 = what's available
  container.bottomAlignContent();

  const chart = container.addImage(
    drawCitationChart(yearlyCitations, options.drawWidth, options.drawHeight)
  );
  chart.applyFittingContentMode();
}

function addTimestamp(parentStack) {
  const updatedText = parentStack.addText(`↻ ${formatTimestamp(new Date())}`);
  updatedText.font = Font.regularSystemFont(9);
  updatedText.textColor = MUTED_COLOR;
  updatedText.lineLimit = 1;
}

function addHeader(parentStack, stats, options) {
  const headerRow = parentStack.addStack();
  headerRow.centerAlignContent();

  if (stats.avatar) {
    const avatarImage = headerRow.addImage(stats.avatar);
    avatarImage.imageSize = new Size(options.avatarSize, options.avatarSize);
    avatarImage.cornerRadius = options.avatarSize / 2;
    headerRow.addSpacer(7);
  }

  const nameColumn = headerRow.addStack();
  nameColumn.layoutVertically();

  const nameText = nameColumn.addText(displayName(stats.authorName));
  nameText.font = Font.mediumSystemFont(options.fontSize);
  nameText.textColor = MUTED_COLOR;
  nameText.lineLimit = 1;
  nameText.minimumScaleFactor = 0.8;

  if (options.withAffiliation && stats.affiliation) {
    const affiliationText = nameColumn.addText(stats.affiliation);
    affiliationText.font = Font.regularSystemFont(9);
    affiliationText.textColor = MUTED_COLOR;
    affiliationText.lineLimit = 1;
    affiliationText.minimumScaleFactor = 0.8;
  }

  headerRow.addSpacer();
  if (options.withTimestamp) addTimestamp(headerRow);
}

function addCitationHeadline(parentStack, stats, fontSize) {
  const citationValue = parentStack.addText(stats.citations.toLocaleString());
  citationValue.font = Font.boldRoundedSystemFont(fontSize);
  citationValue.minimumScaleFactor = 0.6;
  citationValue.lineLimit = 1;

  const captionRow = parentStack.addStack();
  captionRow.centerAlignContent();

  const citationLabel = captionRow.addText("citations");
  citationLabel.font = Font.regularSystemFont(11);
  citationLabel.textColor = MUTED_COLOR;
  citationLabel.lineLimit = 1;
  citationLabel.minimumScaleFactor = 0.8;

  const latest = stats.yearlyCitations[stats.yearlyCitations.length - 1];
  if (!latest || latest.year !== new Date().getFullYear()) return;

  captionRow.addSpacer(6);

  const deltaText = captionRow.addText(
    `+${latest.citations.toLocaleString()} in ${latest.year}`
  );
  deltaText.font = Font.mediumRoundedSystemFont(11);
  deltaText.textColor = ACCENT_COLOR;
  deltaText.lineLimit = 1;
  deltaText.minimumScaleFactor = 0.7;
}

function addStatColumn(parentStack, label, value) {
  const column = parentStack.addStack();
  column.layoutVertically();

  const valueText = column.addText(value.toLocaleString());
  valueText.font = Font.mediumRoundedSystemFont(16);
  valueText.lineLimit = 1;
  valueText.minimumScaleFactor = 0.7;

  const labelText = column.addText(label);
  labelText.font = Font.regularSystemFont(10);
  labelText.textColor = MUTED_COLOR;
  labelText.lineLimit = 1;
  labelText.minimumScaleFactor = 0.7;
}

function addStatChip(parentStack, label, value) {
  const chip = parentStack.addStack();
  chip.layoutVertically();
  chip.size = new Size(0, CHIP_HEIGHT); // width 0 = size to the text
  chip.setPadding(4, 6, 4, 6);
  chip.cornerRadius = 8;
  chip.backgroundColor = CHIP_BACKGROUND;

  // Six-figure counts push this row past the widget width, so the text shrinks
  // rather than eliding into "i10-inde…" — in a fixed slot, so shrinking it
  // moves neither its baseline nor the label below.
  const valueRow = chip.addStack();
  valueRow.size = new Size(0, CHIP_VALUE_HEIGHT);
  valueRow.bottomAlignContent();

  const valueText = valueRow.addText(value.toLocaleString());
  valueText.font = Font.mediumRoundedSystemFont(15);
  valueText.lineLimit = 1;
  valueText.minimumScaleFactor = 0.7;

  const labelText = chip.addText(label);
  labelText.font = Font.regularSystemFont(9);
  labelText.textColor = MUTED_COLOR;
  labelText.lineLimit = 1;
  labelText.minimumScaleFactor = 0.7;
}

function addStatChipRow(parentStack, stats) {
  const chipRow = parentStack.addStack();
  chipRow.centerAlignContent();

  addStatChip(chipRow, "h-index", stats.hIndex);
  chipRow.addSpacer(6);
  addStatChip(chipRow, "i10-index", stats.i10Index);
  // Zero is a real value, so test for a number rather than truthiness. The year
  // is abbreviated because this is the widest of the three labels.
  if (stats.sinceYear && Number.isFinite(stats.recentCitations)) {
    chipRow.addSpacer(6);
    addStatChip(chipRow, `since '${stats.sinceYear.slice(2)}`, stats.recentCitations);
  }
}

function addDivider(parentStack) {
  const divider = parentStack.addStack();
  divider.size = new Size(0, 1);
  divider.backgroundColor = DIVIDER_COLOR;
  divider.addSpacer(); // an empty stack has no width to draw across
}

function addTopPublications(parentStack, publications) {
  const heading = parentStack.addText("Most cited");
  heading.font = Font.mediumSystemFont(10);
  heading.textColor = MUTED_COLOR;
  parentStack.addSpacer(5);

  publications.slice(0, TOP_PUBLICATION_COUNT).forEach((publication, index) => {
    if (index > 0) parentStack.addSpacer(6);

    const row = parentStack.addStack();
    row.centerAlignContent();

    const titleText = row.addText(publication.title);
    titleText.font = Font.regularSystemFont(11);
    titleText.lineLimit = 1;
    row.addSpacer(8);

    const citationsText = row.addText(publication.citations.toLocaleString());
    citationsText.font = Font.mediumRoundedSystemFont(11);
    citationsText.textColor = ACCENT_COLOR;
    citationsText.lineLimit = 1;
  });
}

function buildSmallWidget(widget, stats) {
  addHeader(widget, stats, { avatarSize: 20, fontSize: 11 });
  widget.addSpacer(6);
  addCitationHeadline(widget, stats, 34);

  widget.addSpacer(3);
  addTimestamp(widget); // no room beside the name at this size

  widget.addSpacer();

  const statsRow = widget.addStack();
  addStatColumn(statsRow, "h-index", stats.hIndex);
  statsRow.addSpacer();
  addStatColumn(statsRow, "i10-index", stats.i10Index);
}

// Numbers on the left, chart filling the height on the right: a full-width
// chart here is too short for the bars to be comparable.
function buildMediumWidget(widget, stats) {
  addHeader(widget, stats, { avatarSize: 20, fontSize: 12, withTimestamp: true });
  widget.addSpacer(6);

  const bodyRow = widget.addStack();
  bodyRow.spacing = 10;
  bodyRow.bottomAlignContent();

  const numbersColumn = bodyRow.addStack();
  numbersColumn.layoutVertically();
  addCitationHeadline(numbersColumn, stats, 30);
  numbersColumn.addSpacer();
  addStatChipRow(numbersColumn, stats);

  addChart(bodyRow, stats.yearlyCitations.slice(-MEDIUM_CHART_YEARS), {
    drawWidth: 165,
    drawHeight: 116,
    boxHeight: 108,
  });
}

// Chips sit beside the headline: a large widget runs out of height long before
// it runs out of width.
function buildLargeWidget(widget, stats) {
  addHeader(widget, stats, {
    avatarSize: 28,
    fontSize: 13,
    withAffiliation: true,
    withTimestamp: true,
  });
  widget.addSpacer(10);

  const summaryRow = widget.addStack();
  summaryRow.bottomAlignContent();

  const numbersColumn = summaryRow.addStack();
  numbersColumn.layoutVertically();
  addCitationHeadline(numbersColumn, stats, 38);

  summaryRow.addSpacer();
  addStatChipRow(summaryRow, stats);

  widget.addSpacer(12);
  addChart(widget, stats.yearlyCitations, {
    drawWidth: 320,
    drawHeight: 114,
    boxHeight: 110,
  });

  if (stats.publications.length > 0) {
    widget.addSpacer(16);
    addDivider(widget);
    widget.addSpacer(12);
    addTopPublications(widget, stats.publications);
  }

  widget.addSpacer();
}

function buildStatsWidget(stats) {
  const statsWidget = createWidget();
  statsWidget.url = profileUrl(scholarId);

  if (isLarge) buildLargeWidget(statsWidget, stats);
  else if (isMedium) buildMediumWidget(statsWidget, stats);
  else buildSmallWidget(statsWidget, stats);

  statsWidget.refreshAfterDate = new Date(Date.now() + REFRESH_INTERVAL_MS);
  return statsWidget;
}

function buildMessageWidget(title, message) {
  const messageWidget = createWidget();

  const heading = messageWidget.addText(title);
  heading.font = Font.mediumSystemFont(13);

  messageWidget.addSpacer(4);

  const detail = messageWidget.addText(message);
  detail.font = Font.regularSystemFont(10);
  detail.textColor = MUTED_COLOR;

  return messageWidget;
}

let widget;
if (scholarId.length === 0) {
  widget = buildMessageWidget(
    "Add your Scholar ID",
    "Long-press the widget, tap Edit Widget, and put your profile URL or user ID in Parameter."
  );
} else {
  try {
    widget = buildStatsWidget(await fetchProfileStats(scholarId));
  } catch (error) {
    widget = buildMessageWidget("Scholar unavailable", String(error.message || error));
    widget.refreshAfterDate = new Date(Date.now() + RETRY_INTERVAL_MS);
  }
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else if (isLarge) {
  widget.presentLarge();
} else if (isMedium) {
  widget.presentMedium();
} else {
  widget.presentSmall();
}
Script.complete();
