export type DocTab =
  | 'about'
  | 'privacy'
  | 'terms'
  | 'safety'
  | 'data_security'
  | 'acceptable_use'
  | 'licenses';

export interface EditableDocumentItem {
  id: DocTab;
  label: string;
  tag: string;
  description: string;
  heading: string;
  subheading: string;
  content: string;
  updatedAt?: string;
  isCustom?: boolean;
}

export const DEFAULT_EDITABLE_DOCUMENTS: Record<DocTab, EditableDocumentItem> = {
  about: {
    id: 'about',
    label: 'About Aestific',
    tag: 'Overview',
    description: 'Intelligence, reimagined. Overview, architecture principles, and creator information.',
    heading: 'About Aestific',
    subheading: 'Intelligence, Reimagined.',
    content: `Aestific is an AI-powered platform designed to make advanced artificial intelligence feel simple, useful, and natural.

Instead of forcing users to think about which model or technology they need, Aestific is designed to understand the task and use the appropriate intelligence behind the scenes.

From everyday questions and deep reasoning to coding, research, image understanding, file analysis, creative work, and image generation, Aestific brings different forms of AI capability into one experience.

### Built for the way you work

Aestific is designed around a simple idea:

> **You should focus on what you want to accomplish — not on which AI model should do it.**

Its intelligent architecture can route different types of tasks through the appropriate AI capabilities while keeping the experience unified inside Aestific.

Aestific also supports personalization, allowing users to shape how Aestific communicates with them, including preferred language, tone, response style, and other personal instructions.

### More than a chatbot

Aestific is built as a broader AI experience rather than simply a text box.

Depending on the features available in the product, users can use Aestific to:
- Ask questions and explore ideas
- Learn and understand difficult topics
- Solve problems and reason through complex tasks
- Write, rewrite, and improve content
- Work with code and technical problems
- Research information
- Understand images and files
- Generate images from natural-language requests
- Personalize how Aestific communicates
- Keep conversations organized in one place

### Built with a vision for accessible intelligence

Aestific aims to make powerful AI accessible through a clean, understandable, and focused experience — without requiring users to understand the technical systems working behind the scenes.

The product will continue to evolve as new AI capabilities become available.

---

### Made by Atif Al Wasi

Aestific is created and developed by **Atif Al Wasi**, with the goal of building an AI experience that combines intelligence, creativity, and simplicity into one platform.

**Aestific — AI, reimagined.**`,
  },
  privacy: {
    id: 'privacy',
    label: 'Privacy Policy',
    tag: 'Privacy',
    description: 'Transparent overview of user information, AI processing, cloud storage, and retention.',
    heading: 'Privacy Policy',
    subheading: 'Last Updated: 25th September 2026',
    content: `Aestific ("Aestific", "we", "us", or "our") respects your privacy and is committed to handling your information responsibly.

This Privacy Policy explains what information may be processed when you use Aestific, why it may be processed, and the choices available to you.

### 1. Information You Provide

Depending on how you use Aestific, you may provide information such as:
- Account and authentication information
- Your name or preferred name
- Personalization preferences
- Messages and conversations
- Files, images, and other content you choose to upload
- Prompts submitted for AI generation
- Images generated through Aestific
- Feedback, support requests, and other information you voluntarily provide

> You should avoid submitting highly sensitive personal information unless it is necessary for your use of the service.

### 2. Information Generated Through Your Use

Aestific may process information associated with your use of the service, including:
- Conversation history
- AI-generated responses
- Generated images
- Uploaded files
- Personalization settings
- Account and security information
- Technical information required to operate and protect the service

### 3. How We Use Information

Information may be used to:
- Provide and operate Aestific
- Generate AI responses and images
- Maintain conversation and account functionality
- Apply your personalization preferences
- Store and retrieve content you choose to save
- Protect accounts and prevent abuse
- Diagnose technical problems
- Improve reliability and performance
- Provide support
- Comply with applicable legal obligations

### 4. AI Processing

When you use AI features, your prompts and relevant content may be processed by the AI systems required to provide that feature.

For example, an image-generation request may require your image prompt to be sent to the configured image-generation service.

> Aestific does not represent that AI-generated content is always accurate, complete, or appropriate for every purpose.

### 5. Storage

Aestific uses cloud infrastructure to operate its application and store applicable application data.

Different types of information may be stored in different systems depending on the function involved.

Your information is intended to remain associated with the authenticated account to which it belongs, subject to the application's security and retention mechanisms.

### 6. Data Retention

Aestific may retain information for as long as necessary to provide the relevant service, maintain security, comply with legal obligations, or fulfill the purpose for which the information was collected.

Specific retention periods may vary by data type and product functionality.

### 7. Account Security

Aestific uses technical and organizational measures designed to protect user information against unauthorized access, alteration, disclosure, or destruction.

*However, no internet-based service can guarantee absolute security.*

### 8. Your Choices

Depending on the features available in your account, you may be able to:
- Update your account information
- Change personalization preferences
- Manage conversation history
- Log out of your account
- Request account or data-related assistance
- Delete your account where the feature is available

### 9. Third-Party Services

Aestific may rely on third-party infrastructure, AI providers, communication services, storage systems, or other service providers to operate certain features. Those services may process information according to their own terms and privacy policies.

### 10. Children's Privacy

Aestific is not intended to knowingly collect personal information from children in violation of applicable law.

### 11. Changes to This Policy

We may update this Privacy Policy as Aestific evolves. When material changes are made, the updated version will be published with a new "Last Updated" date.

### 12. Contact

For privacy-related questions or requests:
**Email:** atifwasee1048@gmail.com`,
  },
  terms: {
    id: 'terms',
    label: 'Terms of Service',
    tag: 'Terms',
    description: 'User agreement, account responsibilities, service availability, and legal terms.',
    heading: 'Terms of Service',
    subheading: 'Last Updated: 25th September 2026',
    content: `Welcome to Aestific.

These Terms of Service ("Terms") govern your access to and use of Aestific and its related features.

By accessing or using Aestific, you agree to these Terms. If you do not agree with them, please do not use the service.

### 1. About Aestific

Aestific is an AI-powered platform created and developed by **Atif Al Wasi**.

The service may provide conversational AI, reasoning, coding assistance, research capabilities, multimodal understanding, file and image analysis, image generation, personalization, and other AI-powered functionality.

Features may change, be added, or be removed over time.

### 2. Eligibility

You may use Aestific only if you are legally permitted to use the service under the laws applicable to you.

### 3. Your Account

You are responsible for maintaining the security of your account and authentication credentials. You should not share your account credentials with others or knowingly allow unauthorized access to your account.

### 4. Your Content

You retain your rights to content you submit to Aestific, subject to the rights and permissions necessary for Aestific to process that content and provide the requested service. Do not upload content that you are not legally permitted to use.

### 5. AI-Generated Content

Aestific may generate text, code, images, or other content based on your instructions. AI-generated content may contain mistakes, omissions, unexpected results, or inaccurate information. You are responsible for reviewing AI-generated content before relying on it.

### 6. Acceptable Use

You must not use Aestific to:
- Violate applicable law
- Attempt unauthorized access to systems or accounts
- Steal credentials or personal information
- Distribute malware or malicious code
- Abuse or disrupt the service
- Circumvent security controls or usage restrictions
- Infringe the rights of others
- Conduct fraudulent activity
- Use the service in ways that create unreasonable risk to other users or the service

### 7. Availability

Aestific is provided on an evolving basis. We do not guarantee that every feature will always be available, uninterrupted, or error-free.

### 8. Third-Party Services

Some Aestific functionality may depend on third-party services. Aestific is not responsible for independent failures or policy changes of third-party services.

### 9. Security

You must not attempt to bypass Aestific's authentication, authorization, rate limits, security controls, or other technical protections.

### 10. Changes to Aestific

Aestific may evolve over time. Features, interfaces, AI systems, limits, integrations, and technical architecture may change as the service develops.

### 11. Suspension or Termination

Access may be suspended or terminated when reasonably necessary to protect users, the service, security, or comply with legal requirements.

### 12. Disclaimer

> AI output should not be treated as professional medical, legal, financial, or other specialized professional advice unless independently reviewed by an appropriately qualified professional.

### 13. Limitation of Liability

To the maximum extent permitted by applicable law, Aestific and its operators will not be responsible for losses arising from reliance on inaccurate AI-generated content, temporary service interruptions, third-party service failures, or misuse of the service.

### 14. Changes to These Terms

We may update these Terms as Aestific evolves. Updated Terms will be published with a new "Last Updated" date.

### 15. Contact

For questions regarding these Terms:
**Email:** atifwasee1048@gmail.com`,
  },
  safety: {
    id: 'safety',
    label: 'AI Safety and Limitations',
    tag: 'Safety',
    description: 'Understanding model probabilistic nature, verification guidelines, and safety filters.',
    heading: 'AI Safety and Limitations',
    subheading: 'Understanding model capabilities, probabilistic outputs, and verification responsibilities.',
    content: `Aestific provides AI-generated text, code, image, and multimodal outputs. These outputs are generated by AI systems and may sometimes be inaccurate, incomplete, outdated, or unexpected.

### AI-Generated Responses

Aestific's responses are generated from the AI systems configured for the requested task. An answer that sounds confident may still contain mistakes.

Users should independently verify important information before relying on it, especially when accuracy is critical.

### Coding & Technical Output

AI-generated code may contain errors or security issues. Code should be reviewed, tested, and understood before being used in a production system.

### Current Information

AI responses are not necessarily real-time. When a task uses Aestific's web-search capability, information may be retrieved from external sources. Retrieved information should still be checked when accuracy is important.

### Image Generation

Aestific can generate images from user prompts. Generated images may not always reproduce every requested detail exactly and may contain visual inaccuracies or unexpected elements.

Image-generation requests may also be rejected by the configured image-generation system's safety controls.

### Important Decisions

Aestific is an AI assistance tool and should not be treated as a replacement for qualified professional advice. Important medical, legal, financial, or other high-impact decisions should be independently verified with appropriate authoritative sources or professionals.`,
  },
  data_security: {
    id: 'data_security',
    label: 'Data and Security',
    tag: 'Security',
    description: 'Strict multi-tenant isolation, cryptographic bcrypt hashing, and secure storage.',
    heading: 'Data and Security',
    subheading: 'Transparent verification of real, implemented storage engines, session isolation, and cryptographic standards.',
    content: `Aestific uses separate systems for structured application data and stored files.

### Account Isolation

User-owned conversations, messages, files, memories, usage information, and personalization data are associated with the authenticated user's account.

Database operations use the authenticated user ID when accessing user-owned records.

### Production Database

In the production architecture, Cloudflare D1 is used as the authoritative structured database.

Production database configuration is required for the production database path, and database availability failures are handled explicitly rather than silently treating a missing production database as normal operation.

### File Storage

Supabase Storage is used for persistent file and image storage in the production storage architecture.

Production storage uses private-bucket requirements and authenticated server-side access.

### File Security

Uploaded files are checked using file-content signatures (magic bytes) in addition to normal file information.

Uploaded paths and filenames are handled to prevent directory traversal such as \`../\`.

### Password Security

Passwords are not stored as plaintext. Aestific uses bcrypt-based password hashing for account passwords.

### Authentication Cookies

Authentication sessions use HTTP-only cookies so session tokens are not directly accessible to normal client-side JavaScript.

Secure and SameSite cookie settings are applied according to the request environment.

### Data Retention

Aestific includes an automated 30-day retention cleanup system for data covered by the retention policy.

Users can also manually clear available conversation history or memory items through the application.

### Development vs Production

Development and test environments may use local fallback storage where the production services are not configured. These development behaviors are separate from the authoritative production storage architecture.`,
  },
  acceptable_use: {
    id: 'acceptable_use',
    label: 'Acceptable Use Policy',
    tag: 'Conduct',
    description: 'Mandatory rules, strictly prohibited activities, abuse prevention, and enforcement.',
    heading: 'Acceptable Use Policy (AUP)',
    subheading: 'Mandatory rules for all users, accounts, API clients, and automated integrations.',
    content: `Aestific is intended to be used for lawful, responsible, and constructive purposes.

By using Aestific, you agree not to use the service to:

### Abuse or Attack the Service
- Attempt to bypass authentication or authorization.
- Circumvent rate limits or other technical protections.
- Attempt unauthorized access to another user's account or data.
- Disrupt, overload, or interfere with the service or its infrastructure.

### Fraud and Deception
- Use Aestific to facilitate scams, phishing, credential theft, or other fraudulent activity.
- Impersonate another person or organization in a way intended to deceive others.

### Malicious Software or Unauthorized Access
- Use Aestific to facilitate malware, credential theft, unauthorized access, or other malicious activity.

### Harassment and Harmful Abuse
- Use Aestific to facilitate targeted harassment, threats, or abusive campaigns.
- Use generated content to deliberately deceive, harass, or harm other people.

### Illegal or Abusive Content
- Use Aestific for activities that violate applicable law or the rights of others.
- Submit or generate content that violates applicable safety requirements or the restrictions of the underlying AI services.

### Account and Data Abuse
- Attempt to access, modify, or delete another user's data.
- Share or misuse another user's private information without authorization.

### Enforcement
Aestific may apply technical restrictions, limit access, suspend an account, or terminate access when necessary to protect the service, its users, or comply with applicable requirements.`,
  },
  licenses: {
    id: 'licenses',
    label: 'Open Source Licenses',
    tag: 'Licenses',
    description: 'Official attribution and license disclosures for third-party libraries used in Aestific.',
    heading: 'Open Source Licenses',
    subheading: 'Official attribution and license disclosures for open-source libraries utilized by Aestific.',
    content: `Aestific is built using open-source software libraries. In accordance with license requirements, the table below lists the third-party open-source dependencies directly utilized by Aestific, along with their respective verified licenses:

| Package | License | Purpose |
| :--- | :--- | :--- |
| react & react-dom | MIT | Component rendering and virtual DOM lifecycle |
| vite | MIT | Next-generation frontend tooling and bundler |
| express | MIT | Minimalist Node.js API framework |
| motion | MIT | Animation and gesture library for React |
| lucide-react | ISC | Accessible iconography library |
| @tailwindcss/vite | MIT | Tailwind CSS Vite integration plugin |
| clsx | MIT | Utility for constructing className strings conditionally |
| tailwind-merge | MIT | Utility for merging Tailwind CSS classes without style conflicts |
| @google/genai | Apache-2.0 | Official Google Gemini AI JavaScript SDK |
| groq-sdk | Apache-2.0 | Official JavaScript/TypeScript SDK for Groq inference |
| @aws-sdk/client-s3 | Apache-2.0 | AWS SDK for JavaScript S3 client for object storage |
| jsonwebtoken | MIT | JSON Web Token implementation for secure sessions |
| bcryptjs | BSD-3-Clause | Optimized bcrypt password hashing in pure JavaScript |
| pdf-parse | Apache-2.0 | Pure JavaScript PDF text extraction library |
| recharts | MIT | Redesigned charting library built on React components |
| react-markdown & remark-gfm | MIT | Markdown renderer and GitHub Flavored Markdown plugin |
| cookie-parser | MIT | HTTP request cookie parsing middleware |
| multer | MIT | Multipart/form-data middleware for file uploads |
| dotenv | BSD-2-Clause | Zero-dependency environment variable parser |

### Notice of Copyright
All copyright notices, permissions, and license texts of the respective authors and contributors are retained within the distributed package artifacts and node_modules dependencies.`,
  },
};

const DOCS_STORAGE_KEY = 'aestific_editable_documents_v1';

export function getCachedEditableDocuments(): Record<DocTab, EditableDocumentItem> {
  try {
    const raw = localStorage.getItem(DOCS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const merged = { ...DEFAULT_EDITABLE_DOCUMENTS };
        for (const key of Object.keys(DEFAULT_EDITABLE_DOCUMENTS) as DocTab[]) {
          if (parsed[key] && typeof parsed[key] === 'object') {
            merged[key] = {
              ...DEFAULT_EDITABLE_DOCUMENTS[key],
              ...parsed[key],
            };
          }
        }
        return merged;
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return { ...DEFAULT_EDITABLE_DOCUMENTS };
}

export function saveCachedEditableDocuments(docs: Record<DocTab, EditableDocumentItem>): void {
  try {
    localStorage.setItem(DOCS_STORAGE_KEY, JSON.stringify(docs));
    window.dispatchEvent(new CustomEvent('aestific-documents-updated'));
  } catch {
    // Ignore storage write errors
  }
}
