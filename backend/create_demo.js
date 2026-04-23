const { Document, Packer, Paragraph, HeadingLevel } = require('docx');
const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const humanContent = [
  "Human Written: Remote Work Evolution",
  "",
  "The Evolution of Remote Work in Modern Organizations",
  "",
  "Over the past five years, I've watched our company transform from a traditional office environment to a hybrid work model. It wasn't an overnight change, and honestly, it was messy at times. But what I've learned through this transition is invaluable.",
  "",
  "When we first started discussing remote work, our leadership team was hesitant. We worried about accountability, company culture, and whether people would actually get their work done. Sarah from HR kept bringing up studies about isolation and team cohesion. To address these concerns, we started small with one day a week.",
  "",
  "The results surprised us. Productivity actually increased. People had fewer interruptions, could focus better on complex tasks, and seemed happier. One developer, Marcus, told me he was finally able to finish his architectural designs without constant Slack notifications.",
  "",
  "Of course, challenges emerged. We had to rethink how we onboard new employees. Training someone remotely is fundamentally different. We created a buddy system where experienced team members could mentor newcomers through video calls and shared workspaces.",
  "",
  "What strikes me most is how this shift revealed what really matters in our work. We stopped measuring success by 'butts in seats' and started focusing on outcomes. Some team members thrived remotely, while others needed more face-to-face interaction. We learned to be flexible.",
  "",
  "Today, I believe the future of work isn't entirely remote or entirely in-office. It's about giving people agency to work where they're most productive. That's the real lesson from our journey."
];

const mixedContent = [
  "Mixed Content: Machine Learning in Healthcare",
  "",
  "Machine Learning Applications in Healthcare: A Comprehensive Overview",
  "",
  "I remember attending a conference last year where Dr. Patel shared her experience implementing an AI diagnostic tool in her hospital. She explained how the system could detect early-stage breast cancer with 94% accuracy, often catching cases that human radiologists missed initially.",
  "",
  "The integration of machine learning in healthcare typically involves several key steps: data collection and preprocessing, model development, validation against existing standards, and clinical implementation. These systems require rigorous testing to ensure patient safety and regulatory compliance.",
  "",
  "What impressed me most from Dr. Patel's presentation was the human element. She emphasized that the AI tool gave doctors more time to focus on patient interaction rather than spending hours analyzing images. One nurse told her, 'I finally have time to actually talk to patients about their concerns.'",
  "",
  "Machine learning has demonstrated remarkable capabilities in disease prediction, treatment recommendation systems, and personalized medicine approaches. The field continues to evolve with advances in deep learning architectures and increased computational resources.",
  "",
  "However, implementation faces significant challenges including data privacy concerns, regulatory requirements, bias in training data, and the need for extensive clinical validation. We must also address equity issues to ensure AI systems serve all populations fairly."
];

const aiContent = [
  "AI Generated: Impact of Artificial Intelligence on Global Economics",
  "",
  "The Impact of Artificial Intelligence on Global Economic Growth",
  "",
  "Artificial intelligence represents a paradigm shift in technological advancement, fundamentally altering economic structures and operational methodologies across diverse industries. The global market for AI solutions is projected to experience exponential growth, with estimates suggesting a compound annual growth rate of 38.1% through 2030.",
  "",
  "The integration of AI technologies facilitates enhanced efficiency in resource allocation, streamlines operational processes, and enables predictive analytics capabilities previously unattainable through conventional methodologies. Organizations implementing AI-driven solutions report productivity increases ranging from 20% to 40% across various business functions.",
  "",
  "Key sectors experiencing significant transformation include manufacturing, financial services, healthcare, retail, and telecommunications. In manufacturing, AI-powered predictive maintenance systems reduce downtime by up to 45%, while in financial services, algorithmic trading and fraud detection systems process millions of transactions instantaneously.",
  "",
  "The economic implications extend beyond individual enterprise optimization. Macroeconomic analysis indicates that widespread AI adoption correlates with increased GDP growth rates, enhanced innovation ecosystems, and expanded employment opportunities in technology-adjacent sectors.",
  "",
  "The global talent shortage for AI specialists remains a significant bottleneck, with demand far exceeding supply. Educational institutions and corporate training programs are increasingly investing in AI and machine learning curricula to address this capacity gap.",
  "",
  "Future projections suggest that AI will contribute an estimated $15.7 trillion to the global economy by 2030, with the technology serving as a fundamental catalyst for organizational transformation and competitive advantage in increasingly digital marketplaces."
];

function createDocxDocument(title, content) {
  const paragraphs = content.map((text) => {
    if (text === "") {
      return new Paragraph({ text: "" });
    }
    return new Paragraph({
      text: text,
      spacing: { line: 360, after: 200 }
    });
  });

  return new Document({
    sections: [{
      children: paragraphs
    }]
  });
}

async function createPdfDocument(title, content) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const { height } = page.getSize();
  
  let yPosition = height - 50;
  const lineHeight = 14;
  const pageMargin = 40;
  
  page.drawText(title, {
    x: pageMargin,
    y: yPosition,
    size: 18,
    color: rgb(0, 0, 0)
  });
  
  yPosition -= 35;
  
  content.forEach(text => {
    if (text === "") {
      yPosition -= lineHeight;
      return;
    }
    
    const words = text.split(' ');
    let line = '';
    
    for (let word of words) {
      if ((line + word).length > 85) {
        page.drawText(line, {
          x: pageMargin,
          y: yPosition,
          size: 10,
          color: rgb(0, 0, 0)
        });
        yPosition -= lineHeight;
        line = word + ' ';
      } else {
        line += word + ' ';
      }
    }
    
    if (line) {
      page.drawText(line, {
        x: pageMargin,
        y: yPosition,
        size: 10,
        color: rgb(0, 0, 0)
      });
      yPosition -= lineHeight;
    }
    
    yPosition -= 4;
    
    if (yPosition < pageMargin) {
      const newPage = pdfDoc.addPage([595, 842]);
      yPosition = height - 50;
    }
  });
  
  return pdfDoc;
}

async function generateFiles() {
  try {
    const docDir = '../demo_files';
    if (!fs.existsSync(docDir)) {
      fs.mkdirSync(docDir, { recursive: true });
    }

    // Create DOCX files
    const humanDoc = createDocxDocument("Human Written", humanContent);
    const mixedDoc = createDocxDocument("Mixed Content", mixedContent);
    const aiDoc = createDocxDocument("AI Generated", aiContent);

    const [humanBuffer, mixedBuffer, aiBuffer] = await Promise.all([
      Packer.toBuffer(humanDoc),
      Packer.toBuffer(mixedDoc),
      Packer.toBuffer(aiDoc)
    ]);

    fs.writeFileSync(path.join(docDir, '1_Human_Written.docx'), humanBuffer);
    fs.writeFileSync(path.join(docDir, '2_Mixed_Content.docx'), mixedBuffer);
    fs.writeFileSync(path.join(docDir, '3_AI_Generated.docx'), aiBuffer);
    console.log('✓ Created .docx files');

    // Create PDF files
    const humanPdf = await createPdfDocument("Human Written: Remote Work Evolution", humanContent);
    const mixedPdf = await createPdfDocument("Mixed Content: ML in Healthcare", mixedContent);
    const aiPdf = await createPdfDocument("AI Generated: AI Impact on Economics", aiContent);

    const humanPdfBytes = await humanPdf.save();
    const mixedPdfBytes = await mixedPdf.save();
    const aiPdfBytes = await aiPdf.save();

    fs.writeFileSync(path.join(docDir, '1_Human_Written.pdf'), humanPdfBytes);
    fs.writeFileSync(path.join(docDir, '2_Mixed_Content.pdf'), mixedPdfBytes);
    fs.writeFileSync(path.join(docDir, '3_AI_Generated.pdf'), aiPdfBytes);
    console.log('✓ Created .pdf files');

    console.log('\n✅ All demo files created successfully!');
    console.log('Location: ' + path.resolve(docDir));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

generateFiles();
