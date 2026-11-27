---
title: Free Code 128 barcode generator for SKUs and warehouse labels
description: Generate Code 128 barcodes from one SKU or a list. Download an SVG or print warehouse labels at the selected size, with your data kept in your browser.
date: '2026-11-26T00:00:00.000Z'
category: tools-templates
featured: false
thumbnail:
  src: /media/blog/6b08ba3a180e2184ebefe335-6b08b99f59c1ec41a0cc826a-om-guide-barcode.jpeg
  alt: ''
  decorative: true
draft: false
---

Enter the SKU or bin address you already use. The generator turns each line into a Code 128 barcode, including leading zeros. Download a single label as a vector SVG or print a whole sheet. The values stay in your browser.

<om-embed name="blog-code-128-barcode-generator-1"></om-embed>

## Print a sheet from a SKU list

1. Copy one column from your spreadsheet and paste it into the box. You can also import a one-column CSV with an optional `SKU` header. Format codes as text in your spreadsheet so it preserves zeros before you export.
2. Choose the physical label size. The tool keeps the narrowest bar at 0.375 mm and reserves white space on both sides. If a value is too long, choose a wider label or shorten the identifier.
3. Use **Print label sheet**. Choose actual size or 100% in the print dialog and turn off browser headers and footers. The dotted outline is a cutting guide for plain sheets. Check alignment on a blank sheet before using label stock.
4. Scan a test print into a plain text field. The six-character sample `000042` should come back as six characters. Test with the printer, paper, and scanner you expect to use on the floor.

## Should I use Code 128 for this label?

Code 128 works well for internal identifiers that include letters, numbers, or punctuation. A shelf labeled `BIN-A-04` and a product labeled `SKU-00127` can use the same barcode format while identifying different things. Decide which record the scanner should look up before you print either label.

Retail and trading-partner requirements are separate. A retailer may require a GTIN in a particular symbol. GS1-128 also has a defined structure, including FNC1 and application identifiers. This tool generates ordinary Code 128 for your own identifiers. Check a trading partner's specification before printing labels for its receiving line. [GS1 explains the GS1-128 format.](https://support.gs1.org/support/solutions/articles/43000734455-what-is-the-format-of-gs1-128-)

## Why will a label scan on screen but fail on paper?

Start with size and contrast. Keep the bars black, the background white, and the blank strips beside the symbol clear. A screenshot expanded in a document can blur the edges. The SVG download keeps them sharp. If a long identifier was squeezed onto a narrow label by another program, print the original SVG at its intended size and try again.

## Connect a scanned value to warehouse stock

A barcode carries a value. Your receiving or picking software decides what to do with it. A product code might look up stock by SKU. A bin address might identify the source for a movement. Open Mercato's warehouse module tracks quantities by product and location, and its movement ledger records where stock went. [See how products and bins are represented in the WMS.](/blog-posts/wms-module-open-source)
