// content/pdf-export.js

const ACPdfExport = (() => {
  const MARGIN = 15;
  const PAGE_WIDTH = 210;
  const PAGE_HEIGHT = 297;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

  const HEADER_HEIGHT = 32;
  const FOOTER_HEIGHT = 12;
  const BOTTOM_LIMIT = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT;

  const MAX_IMG_HEIGHT = 100;

  const COLORS = {
    headerBg: [15, 23, 42],
    accent: [59, 130, 246],
    dark: [30, 41, 59],
    gray: [100, 116, 139],
    codeBg: [241, 245, 249],
    codeText: [15, 23, 42],
    white: [255, 255, 255],
    border: [220, 226, 234]
  };

  // ============================================================
  // TEXT SANITIZATION
  // ============================================================

  function sanitizeText(text) {
    if (text === null || text === undefined) {
      return '';
    }

    return String(text)
      // Dashes
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-')

      // Quotes
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')

      // Ellipsis
      .replace(/\u2026/g, '...')

      // Non-breaking / invisible spaces
      .replace(/\u00A0/g, ' ')
      .replace(/[\u2000-\u200B]/g, ' ')

      // Arrows
      .replace(/\u2192/g, '->')
      .replace(/\u2190/g, '<-')
      .replace(/\u2194/g, '<->')
      .replace(/\u21D2/g, '=>')
      .replace(/\u21D0/g, '<=')
      .replace(/\u21D4/g, '<=>')
      .replace(/\u2191/g, '^')
      .replace(/\u2193/g, 'v')

      // Mathematical symbols
      .replace(/\u00D7/g, 'x')
      .replace(/\u00F7/g, '/')
      .replace(/\u2260/g, '!=')
      .replace(/\u2264/g, '<=')
      .replace(/\u2265/g, '>=')
      .replace(/\u2248/g, '~')
      .replace(/\u221E/g, 'infinity')
      .replace(/\u221A/g, 'sqrt')

      // Bullets / degree
      .replace(/\u2022/g, '*')
      .replace(/\u00B0/g, ' deg ')

      // Emoji
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
      .replace(/[\u2600-\u27BF]/g, '')

      // Control characters
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')

      // Final protection for jsPDF built-in fonts
      .replace(/[^\x00-\x7F]/g, '')

      // Normalize ordinary text spacing
      .replace(/[ \t]+/g, ' ')
      .trim();
  }


  // ============================================================
  // CODE SANITIZATION
  // Keeps indentation and spacing intact.
  // ============================================================

  function sanitizeCodeLine(text) {
    if (text === null || text === undefined) {
      return '';
    }

    return String(text)
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-')
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/\u2026/g, '...')
      .replace(/\u00A0/g, ' ')
      .replace(/[\u2000-\u200B]/g, ' ')

      // Arrows
      .replace(/\u2192/g, '->')
      .replace(/\u2190/g, '<-')
      .replace(/\u2194/g, '<->')
      .replace(/\u21D2/g, '=>')
      .replace(/\u21D0/g, '<=')
      .replace(/\u21D4/g, '<=>')

      // Mathematical symbols
      .replace(/\u2260/g, '!=')
      .replace(/\u2264/g, '<=')
      .replace(/\u2265/g, '>=')
      .replace(/\u00D7/g, 'x')
      .replace(/\u00F7/g, '/')
      .replace(/\u221E/g, 'infinity')
      .replace(/\u221A/g, 'sqrt')

      // Control characters
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')

      // jsPDF built-in fonts only
      .replace(/[^\x00-\x7F]/g, '');
  }


  // ============================================================
  // MARKDOWN HELPERS
  // ============================================================

  function stripBold(text) {
    return text.replace(/\*\*(.*?)\*\*/g, '$1');
  }


  // ============================================================
  // LONG WORD PROTECTION
  // ============================================================

  function breakLongWords(text, maxCharacters = 45) {
    return text
      .split(' ')
      .flatMap(word => {
        if (word.length <= maxCharacters) {
          return [word];
        }

        const parts = [];

        for (
          let i = 0;
          i < word.length;
          i += maxCharacters
        ) {
          parts.push(
            word.slice(i, i + maxCharacters)
          );
        }

        return parts;
      })
      .join(' ');
  }


  // ============================================================
  // NORMAL TEXT WRAPPING
  // ============================================================

  function wrapText(doc, text, width) {
    const safeText =
      breakLongWords(
        sanitizeText(text)
      );

    if (!safeText) {
      return [];
    }

    return doc.splitTextToSize(
      safeText,
      width
    );
  }


  // ============================================================
  // CODE WRAPPING
  // ============================================================

  function wrapCodeLine(doc, line, width) {
    const safeLine =
      sanitizeCodeLine(line);

    if (!safeLine.length) {
      return [' '];
    }

    const pieces = [];
    let remaining = safeLine;

    while (remaining.length) {
      const measured =
        doc.splitTextToSize(
          remaining,
          width
        );

      if (!measured.length) {
        pieces.push(' ');
        break;
      }

      const first =
        measured[0];

      if (first === remaining) {
        pieces.push(remaining);
        break;
      }

      if (first.length > 0) {
        pieces.push(first);

        remaining =
          remaining.slice(
            first.length
          );
      } else {
        const fallbackLength =
          Math.max(
            1,
            Math.floor(
              remaining.length * 0.8
            )
          );

        pieces.push(
          remaining.slice(
            0,
            fallbackLength
          )
        );

        remaining =
          remaining.slice(
            fallbackLength
          );
      }
    }

    return pieces;
  }


  // ============================================================
  // PARSE NOTES
  // ============================================================

  function parseNotesToBlocks(notesText) {
    const lines =
      String(notesText || '')
        .split('\n');

    const blocks = [];

    let inCode = false;
    let codeLines = [];

    for (const raw of lines) {
      const line =
        sanitizeText(
          raw.replace(/\r$/, '')
        );

      const codeMatch =
        line.match(/^```(\w*)/);


      // Code block starts
      if (
        codeMatch &&
        !inCode
      ) {
        inCode = true;
        codeLines = [];
        continue;
      }


      // Code block ends
      if (
        line.trim() === '```' &&
        inCode
      ) {
        inCode = false;

        blocks.push({
          type: 'code',
          text: codeLines.join('\n')
        });

        continue;
      }


      // Inside code
      if (inCode) {
        codeLines.push(
          sanitizeCodeLine(
            raw.replace(/\r$/, '')
          )
        );

        continue;
      }


      // H3
      if (
        /^##\s+/.test(line)
      ) {
        blocks.push({
          type: 'h3',
          text:
            line
              .replace(
                /^##\s+/,
                ''
              )
              .trim()
        });

        continue;
      }


      // H4
      if (
        /^###\s+/.test(line)
      ) {
        blocks.push({
          type: 'h4',
          text:
            line
              .replace(
                /^###\s+/,
                ''
              )
              .trim()
        });

        continue;
      }


      // Bullet
      if (
        /^[-*]\s+/.test(line)
      ) {
        blocks.push({
          type: 'bullet',
          text:
            stripBold(
              line
                .replace(
                  /^[-*]\s+/,
                  ''
                )
                .trim()
            )
        });

        continue;
      }


      // Paragraph
      if (
        line.trim().length > 0
      ) {
        blocks.push({
          type: 'p',
          text:
            stripBold(
              line.trim()
            )
        });
      } else {
        blocks.push({
          type: 'space'
        });
      }
    }


    // Handle unclosed code block
    if (
      inCode &&
      codeLines.length
    ) {
      blocks.push({
        type: 'code',
        text:
          codeLines.join('\n')
      });
    }

    return blocks;
  }


  // ============================================================
  // IMAGE DIMENSIONS
  // ============================================================

  function loadImageDims(dataUrl) {
    return new Promise(resolve => {
      const img =
        new Image();

      img.onload = () => {
        resolve({
          width:
            img.naturalWidth || 4,

          height:
            img.naturalHeight || 3
        });
      };

      img.onerror = () => {
        resolve({
          width: 4,
          height: 3
        });
      };

      img.src = dataUrl;
    });
  }


  // ============================================================
  // HEADER
  // ============================================================

  function drawHeader(
    doc,
    title,
    meta
  ) {
    doc.setFillColor(
      ...COLORS.headerBg
    );

    doc.rect(
      0,
      0,
      PAGE_WIDTH,
      HEADER_HEIGHT,
      'F'
    );


    // Brand
    doc.setTextColor(
      ...COLORS.accent
    );

    doc.setFont(
      'helvetica',
      'bold'
    );

    doc.setFontSize(9);

    doc.text(
      'AC INSIGHTS',
      MARGIN,
      10
    );


    // Title
    doc.setTextColor(
      ...COLORS.white
    );

    doc.setFont(
      'helvetica',
      'bold'
    );

    doc.setFontSize(15);

    const titleLines =
      wrapText(
        doc,
        title,
        CONTENT_WIDTH
      );

    doc.text(
      titleLines.slice(0, 2),
      MARGIN,
      19
    );


    // Metadata
    doc.setTextColor(
      200,
      210,
      225
    );

    doc.setFont(
      'helvetica',
      'normal'
    );

    doc.setFontSize(8.5);

    doc.text(
      sanitizeText(meta),
      MARGIN,
      27
    );
  }


  // ============================================================
  // FOOTERS
  // ============================================================

  function drawFooters(
    doc,
    repoUrl
  ) {
    const total =
      doc.getNumberOfPages();

    for (
      let i = 1;
      i <= total;
      i++
    ) {
      doc.setPage(i);

      doc.setFont(
        'helvetica',
        'normal'
      );

      doc.setFontSize(7.5);

      doc.setTextColor(
        ...COLORS.gray
      );

      const footer =
        sanitizeText(
          `Generated by AC Insights - ${repoUrl}`
        );

      const footerLines =
        doc.splitTextToSize(
          footer,
          125
        );

      doc.text(
        footerLines[0],
        MARGIN,
        PAGE_HEIGHT - 7
      );

      doc.text(
        `Page ${i} of ${total}`,
        PAGE_WIDTH - MARGIN,
        PAGE_HEIGHT - 7,
        {
          align: 'right'
        }
      );
    }
  }


  // ============================================================
  // PDF EXPORT
  // ============================================================

  async function exportToPdf(
    title,
    notesText,
    screenshots = []
  ) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
  throw new Error('jsPDF library not found.');
}
const { jsPDF } = window.jspdf;


    const doc =
      new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait'
      });


    // ----------------------------------------------------------
    // Date
    // ----------------------------------------------------------

    const now =
      new Date();

    const dateStr =
      now.toLocaleDateString(
        'en-IN',
        {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }
      );


    // ----------------------------------------------------------
    // Header
    // ----------------------------------------------------------

    drawHeader(
      doc,
      sanitizeText(title),
      `Generated on ${dateStr}`
    );


    let y =
      HEADER_HEIGHT + 10;


    const blocks =
      parseNotesToBlocks(
        notesText
      );


    // ==========================================================
    // PAGE MANAGEMENT
    // ==========================================================

    function newPage() {
      doc.addPage();

      y =
        MARGIN + 5;
    }


    function ensureSpace(
      needed
    ) {
      if (
        y + needed >
        BOTTOM_LIMIT
      ) {
        newPage();
      }
    }


    // ==========================================================
    // NOTES
    // ==========================================================

    for (
      const block of blocks
    ) {


      // --------------------------------------------------------
      // Empty line
      // --------------------------------------------------------

      if (
        block.type === 'space'
      ) {
        y += 2;
        continue;
      }


      // ========================================================
      // H3
      // ========================================================

      if (
        block.type === 'h3'
      ) {
        doc.setFont(
          'helvetica',
          'bold'
        );

        doc.setFontSize(13);

        const wrapped =
          wrapText(
            doc,
            block.text,
            CONTENT_WIDTH
          );

        const lineHeight =
          5.5;

        const blockHeight =
          9 +
          wrapped.length *
          lineHeight;

        ensureSpace(
          blockHeight
        );


        doc.setDrawColor(
          ...COLORS.accent
        );

        doc.setLineWidth(
          0.8
        );

        doc.line(
          MARGIN,
          y,
          MARGIN + 10,
          y
        );


        y += 5;


        doc.setTextColor(
          ...COLORS.accent
        );

        doc.text(
          wrapped,
          MARGIN,
          y
        );


        y +=
          wrapped.length *
          lineHeight +
          4;

        continue;
      }


      // ========================================================
      // H4
      // ========================================================

      if (
        block.type === 'h4'
      ) {
        doc.setFont(
          'helvetica',
          'bold'
        );

        doc.setFontSize(11);

        const wrapped =
          wrapText(
            doc,
            block.text,
            CONTENT_WIDTH
          );

        const lineHeight = 5;

        const blockHeight =
          wrapped.length *
          lineHeight +
          4;

        ensureSpace(
          blockHeight
        );


        doc.setTextColor(
          ...COLORS.dark
        );

        doc.text(
          wrapped,
          MARGIN,
          y
        );


        y +=
          blockHeight;

        continue;
      }


      // ========================================================
      // BULLET
      // ========================================================

      if (
        block.type === 'bullet'
      ) {
        doc.setFont(
          'helvetica',
          'normal'
        );

        doc.setFontSize(10);

        const wrapped =
          wrapText(
            doc,
            block.text,
            CONTENT_WIDTH - 7
          );

        const lineHeight =
          4.6;

        const blockHeight =
          wrapped.length *
          lineHeight +
          3;

        ensureSpace(
          blockHeight
        );


        // Bullet
        doc.setTextColor(
          ...COLORS.accent
        );

        doc.setFont(
          'helvetica',
          'bold'
        );

        doc.text(
          '-',
          MARGIN,
          y
        );


        // Text
        doc.setTextColor(
          ...COLORS.dark
        );

        doc.setFont(
          'helvetica',
          'normal'
        );

        doc.text(
          wrapped,
          MARGIN + 5,
          y
        );


        y +=
          blockHeight;

        continue;
      }


      // ========================================================
      // CODE BLOCK
      // ========================================================

      if (
        block.type === 'code'
      ) {
        doc.setFont(
          'courier',
          'normal'
        );

        doc.setFontSize(8.5);


        const rawCodeLines =
          block.text.split('\n');


        const wrappedCodeLines =
          [];


        // Wrap code without destroying indentation
        for (
          const codeLine of rawCodeLines
        ) {
          wrappedCodeLines.push(
            ...wrapCodeLine(
              doc,
              codeLine,
              CONTENT_WIDTH - 8
            )
          );
        }


        const lineHeight = 4;
        const codePadding = 6;

        let index = 0;


        // Render code in page-sized sections
        while (
          index <
          wrappedCodeLines.length
        ) {
          const availableHeight =
            BOTTOM_LIMIT - y;

          const availableLines =
            Math.max(
              1,
              Math.floor(
                (
                  availableHeight -
                  codePadding
                ) /
                lineHeight
              )
            );


          const pageLines =
            wrappedCodeLines.slice(
              index,
              index +
              availableLines
            );


          const boxHeight =
            pageLines.length *
            lineHeight +
            codePadding;


          if (
            y + boxHeight >
              BOTTOM_LIMIT &&
            index === 0
          ) {
            newPage();
            continue;
          }


          // Code background
          doc.setFillColor(
            ...COLORS.codeBg
          );

          doc.roundedRect(
            MARGIN,
            y - 4,
            CONTENT_WIDTH,
            boxHeight,
            1.5,
            1.5,
            'F'
          );


          // Code text
          doc.setTextColor(
            ...COLORS.codeText
          );


          let codeY =
            y + 1;


          for (
            const codeLine
              of pageLines
          ) {
            doc.text(
              codeLine,
              MARGIN + 4,
              codeY
            );

            codeY +=
              lineHeight;
          }


          y +=
            boxHeight + 5;


          index +=
            pageLines.length;


          if (
            index <
            wrappedCodeLines.length
          ) {
            newPage();
          }
        }

        continue;
      }


      // ========================================================
      // NORMAL PARAGRAPH
      // ========================================================

      doc.setFont(
        'helvetica',
        'normal'
      );

      doc.setFontSize(10);


      const wrapped =
        wrapText(
          doc,
          block.text,
          CONTENT_WIDTH
        );


      const lineHeight =
        4.6;


      const blockHeight =
        wrapped.length *
        lineHeight +
        2;


      ensureSpace(
        blockHeight
      );


      doc.setTextColor(
        ...COLORS.dark
      );

      doc.text(
        wrapped,
        MARGIN,
        y
      );


      y +=
        blockHeight;
    }


    // ==========================================================
    // SCREEN CAPTURES
    // ==========================================================

    if (
      screenshots &&
      screenshots.length > 0
    ) {
      newPage();


      // Section title
      doc.setTextColor(
        ...COLORS.accent
      );

      doc.setFont(
        'helvetica',
        'bold'
      );

      doc.setFontSize(13);

      doc.text(
        'Screen Captures',
        MARGIN,
        y
      );


      y += 4;


      // Section underline only
      doc.setDrawColor(
        ...COLORS.accent
      );

      doc.setLineWidth(
        0.5
      );

      doc.line(
        MARGIN,
        y,
        PAGE_WIDTH - MARGIN,
        y
      );


      y += 8;


      const SCREENSHOT_GAP = 7;
      const LABEL_HEIGHT = 5;


      for (
        let i = 0;
        i < screenshots.length;
        i++
      ) {
        const screenshot =
          screenshots[i];


        // ------------------------------------------------------
        // Validate image
        // ------------------------------------------------------

        if (
          !screenshot ||
          !screenshot.dataUrl ||
          !screenshot.dataUrl.startsWith(
            'data:image'
          )
        ) {
          console.warn(
            '[AC Insights] Skipping invalid screenshot at index',
            i
          );

          continue;
        }


        // ------------------------------------------------------
        // Get dimensions
        // ------------------------------------------------------

        const dims =
          await loadImageDims(
            screenshot.dataUrl
          );


        if (
          !dims.width ||
          !dims.height
        ) {
          continue;
        }


        // ------------------------------------------------------
        // Calculate proportional size
        // ------------------------------------------------------

        let imgW =
          CONTENT_WIDTH;


        let imgH =
          imgW *
          (
            dims.height /
            dims.width
          );


        if (
          imgH >
          MAX_IMG_HEIGHT
        ) {
          imgH =
            MAX_IMG_HEIGHT;


          imgW =
            imgH *
            (
              dims.width /
              dims.height
            );
        }


        // Center image
        const imgX =
          MARGIN +
          (
            CONTENT_WIDTH -
            imgW
          ) / 2;


        // ------------------------------------------------------
        // Page break if image doesn't fit
        // ------------------------------------------------------

        const requiredHeight =
          LABEL_HEIGHT +
          imgH +
          SCREENSHOT_GAP;


        if (
          y +
          requiredHeight >
          BOTTOM_LIMIT
        ) {
          newPage();
        }


        // ------------------------------------------------------
        // Screenshot label
        // ------------------------------------------------------

        let timeLabel =
          'unknown time';


        if (
          screenshot.timestamp
        ) {
          timeLabel =
            new Date(
              screenshot.timestamp
            ).toLocaleTimeString(
              [],
              {
                hour: '2-digit',
                minute: '2-digit'
              }
            );
        }


        doc.setTextColor(
          ...COLORS.gray
        );

        doc.setFont(
          'helvetica',
          'normal'
        );

        doc.setFontSize(8);


        doc.text(
          `Screenshot ${
            i + 1
          } - ${
            timeLabel
          }`,
          MARGIN,
          y
        );


        y +=
          LABEL_HEIGHT;


        // ------------------------------------------------------
        // Image border
        // ------------------------------------------------------

        doc.setDrawColor(
          ...COLORS.border
        );

        doc.setLineWidth(
          0.3
        );


        doc.rect(
          imgX - 0.5,
          y - 0.5,
          imgW + 1,
          imgH + 1
        );


        // ------------------------------------------------------
        // Image
        // ------------------------------------------------------

        try {
          doc.addImage(
            screenshot.dataUrl,
            'JPEG',
            imgX,
            y,
            imgW,
            imgH,
            undefined,
            'FAST'
          );
        } catch (error) {
          console.error(
            '[AC Insights] Failed to embed screenshot',
            i,
            error
          );
        }


        // ------------------------------------------------------
        // Space before next screenshot
        // ------------------------------------------------------

        y +=
          imgH +
          SCREENSHOT_GAP;
      }
    }


    // ==========================================================
    // FOOTERS
    // ==========================================================

    drawFooters(
      doc,
      'github.com/lakshyashahi0712/ac-insights'
    );


    // ==========================================================
    // FILE NAME
    // ==========================================================

    const safeTitle =
      sanitizeText(title)
        .replace(
          /[^a-zA-Z0-9]/g,
          '_'
        )
        .slice(
          0,
          60
        );


    doc.save(
      `AC-Insights_${safeTitle}.pdf`
    );
  }


  // ============================================================
  // PUBLIC API
  // ============================================================

  return {
    exportToPdf
  };

})();