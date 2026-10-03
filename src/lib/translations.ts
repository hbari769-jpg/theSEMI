export type InterfaceLanguage = 'en' | 'bn';
export type ResponseLanguage = 'Auto' | 'English' | 'বাংলা';

export interface Translations {
  // Common
  save: string;
  saveChanges: string;
  saving: string;
  saved: string;
  cancel: string;
  delete: string;
  close: string;
  on: string;
  off: string;
  auto: string;

  // Settings Modal & Tabs
  settingsTitle: string;
  settingsSubtitle: string;
  tabAccount: string;
  tabAi: string;
  tabAppearance: string;
  tabChat: string;
  tabExperience: string;
  tabLanguage: string;
  tabMemory: string;
  tabPrivacy: string;
  tabDocuments: string;

  // Experience Settings
  experienceTitle: string;
  experienceSubtitle: string;
  responseAnimation: string;
  responseAnimationDesc: string;
  animSmooth: string;
  animSmoothDesc: string;
  animInstant: string;
  animInstantDesc: string;
  generationEffects: string;
  generationEffectsDesc: string;
  genEffectsFull: string;
  genEffectsFullDesc: string;
  genEffectsMinimal: string;
  genEffectsMinimalDesc: string;
  genEffectsOff: string;
  genEffectsOffDesc: string;
  soundEffects: string;
  soundEffectsDesc: string;
  soundOn: string;
  soundOnDesc: string;
  soundOff: string;
  soundOffDesc: string;
  testSound: string;

  // Language Settings
  langTabTitle: string;
  langTabSubtitle: string;
  interfaceLanguageTitle: string;
  interfaceLanguageDesc: string;
  responseLanguageTitle: string;
  responseLanguageDesc: string;
  responseAuto: string;
  responseAutoDesc: string;
  responseEnglish: string;
  responseEnglishDesc: string;
  responseBangla: string;
  responseBanglaDesc: string;

  // Chat Controls Settings
  chatTabTitle: string;
  chatTabSubtitle: string;
  enterToSendTitle: string;
  enterToSendOnDesc: string;
  enterToSendOffDesc: string;
  streamingTitle: string;
  streamingOnDesc: string;
  streamingOffDesc: string;
  autoScrollTitle: string;
  autoScrollOnDesc: string;
  autoScrollOffDesc: string;
  timestampsTitle: string;
  timestampsOnDesc: string;
  timestampsOffDesc: string;

  // Account Settings
  personalDetails: string;
  personalDetailsDesc: string;
  fullName: string;
  emailAddress: string;
  changePassword: string;
  currentPassword: string;
  newPassword: string;
  updatePassword: string;

  // Appearance Settings
  appearanceTitle: string;
  appearanceSubtitle: string;
  themeMode: string;
  systemTheme: string;
  darkTheme: string;
  lightTheme: string;
  reducedMotion: string;

  // AI Engine Settings
  aiEngineTitle: string;
  aiEngineSubtitle: string;
  preferredModel: string;
  systemPrompt: string;
  engineTitle: string;
  engineDesc: string;
  engineAuto: string;
  engineAutoDesc: string;
  engineFast: string;
  engineFastDesc: string;
  engineDeep: string;
  engineDeepDesc: string;
  intelligenceTitle: string;
  intelligenceDesc: string;
  intelBalanced: string;
  intelBalancedDesc: string;
  intelPrecise: string;
  intelPreciseDesc: string;
  intelCreative: string;
  intelCreativeDesc: string;
  contextTitle: string;
  contextDesc: string;
  contextOn: string;
  contextOnDesc: string;
  contextOff: string;
  contextOffDesc: string;
  responseLengthTitle: string;
  responseLengthDesc: string;
  respLenAuto: string;
  respLenAutoDesc: string;
  respLenShort: string;
  respLenShortDesc: string;
  respLenMedium: string;
  respLenMediumDesc: string;
  respLenDetailed: string;
  respLenDetailedDesc: string;

  // Memory Settings
  memoryTitle: string;
  memorySubtitle: string;
  enableMemory: string;

  // Privacy Settings
  privacyTitle: string;
  privacySubtitle: string;
  clearChats: string;
  exportData: string;
  deleteAccount: string;

  // Sidebar & Navigation
  newChat: string;
  chats: string;
  knowledgeFiles: string;
  accountMemory: string;
  pictureStudio: string;
  searchChats: string;
  searchConversations: string;
  noConversations: string;
  pinned: string;
  today: string;
  yesterday: string;
  accountPreferences: string;
  signOut: string;
  memories: string;
  imageStudio: string;
  support: string;
  settings: string;
  logOut: string;
  pin: string;
  unpin: string;
  rename: string;
  deleteConv: string;

  // Chat View & Global UI
  askPlaceholder: string;
  generateIntelligence: string;
  sendMessage: string;
  stopGenerating: string;
  howCanIHelp: string;
  copy: string;
  copied: string;
  webSearch: string;
  deepReasoning: string;
  model: string;
  backToChat: string;
}

export const translations: Record<InterfaceLanguage, Translations> = {
  en: {
    // Common
    save: 'Save',
    saveChanges: 'Save Changes',
    saving: 'Saving...',
    saved: 'Saved!',
    cancel: 'Cancel',
    delete: 'Delete',
    close: 'Close',
    on: 'On',
    off: 'Off',
    auto: 'Auto',

    // Settings Modal & Tabs
    settingsTitle: 'Aestific Settings',
    settingsSubtitle: 'Customize your environment and account preferences',
    tabAccount: 'Account',
    tabAi: 'AI Engine',
    tabAppearance: 'Appearance',
    tabChat: 'Chat Controls',
    tabExperience: 'Experience',
    tabLanguage: 'Language',
    tabMemory: 'Memory',
    tabPrivacy: 'Privacy & Account',
    tabDocuments: 'Documents',

    // Experience Settings
    experienceTitle: 'Experience & Sensory Controls',
    experienceSubtitle: 'Fine-tune response animations, generative visual effects, and interface sound cues.',
    responseAnimation: 'Response Animation',
    responseAnimationDesc: 'Choose how assistant responses animate and settle into the chat canvas.',
    animSmooth: 'Smooth',
    animSmoothDesc: 'Preserves the fluid, natural transitions and smooth scrolling as tokens arrive.',
    animInstant: 'Instant',
    animInstantDesc: 'Immediate display with reduced animation overhead, strictly preserving streaming.',
    generationEffects: 'Generation Effects',
    generationEffectsDesc: 'Control decorative visual effects during image creation while preserving generation status.',
    genEffectsFull: 'Full',
    genEffectsFullDesc: 'Existing full visual effects with ambient glowing particles and scanning light sweeps.',
    genEffectsMinimal: 'Minimal',
    genEffectsMinimalDesc: 'Reduced decorative effects with a clean backdrop and calm, focused indicators.',
    genEffectsOff: 'Off',
    genEffectsOffDesc: 'Removes decorative effects only. Generation phase, prompt, and status remain clearly visible.',
    soundEffects: 'Sound Effects',
    soundEffectsDesc: 'Lightweight, gentle local audio cues for message actions with zero external services.',
    soundOn: 'On',
    soundOnDesc: 'Plays gentle synthesized audio chimes for sent messages and completed generations.',
    soundOff: 'Off',
    soundOffDesc: 'Guarantees that optional UI sounds do not play.',
    testSound: 'Test Sound',

    // Language Settings
    langTabTitle: 'Language Preferences',
    langTabSubtitle: 'Configure your interface language and AI model response language',
    interfaceLanguageTitle: 'Interface Language',
    interfaceLanguageDesc: 'Select the language used across Aestific menus, buttons, and settings.',
    responseLanguageTitle: 'Response Language',
    responseLanguageDesc: 'Determine how the AI selects the language for conversational responses.',
    responseAuto: 'Auto',
    responseAutoDesc: 'Follow user prompt language naturally',
    responseEnglish: 'English',
    responseEnglishDesc: 'Always generate responses in English',
    responseBangla: 'বাংলা',
    responseBanglaDesc: 'Always generate responses in Bengali (বাংলা)',

    // Chat Controls Settings
    chatTabTitle: 'Chat Behavior & Interaction',
    chatTabSubtitle: 'Fine-tune messaging controls, streaming output, auto-scrolling, and timestamp visibility.',
    enterToSendTitle: 'Enter to Send',
    enterToSendOnDesc: 'Pressing Enter sends message; Shift+Enter creates a new line',
    enterToSendOffDesc: 'Pressing Enter inserts a new line; click Send button to submit',
    streamingTitle: 'Streaming Responses',
    streamingOnDesc: 'Tokens stream progressively as the model generates them',
    streamingOffDesc: 'Deliver the completed response all at once upon completion',
    autoScrollTitle: 'Auto-scroll',
    autoScrollOnDesc: 'Automatically follow newly generated tokens as they appear',
    autoScrollOffDesc: "Never forcibly move your manually selected scroll position",
    timestampsTitle: 'Show Timestamps',
    timestampsOnDesc: 'Display exact time stamps beside user and assistant messages',
    timestampsOffDesc: 'Hide timestamp indicators from the chat timeline',

    // Account Settings
    personalDetails: 'Personal Details',
    personalDetailsDesc: 'Manage your display name and email address',
    fullName: 'Full Name',
    emailAddress: 'Email Address',
    changePassword: 'Change Password',
    currentPassword: 'Current Password',
    newPassword: 'New Password',
    updatePassword: 'Update Password',

    // Appearance Settings
    appearanceTitle: 'Visual Theme & Appearance',
    appearanceSubtitle: 'Choose your aesthetic theme mode and visual motion preferences.',
    themeMode: 'Theme Mode',
    systemTheme: 'System',
    darkTheme: 'Dark',
    lightTheme: 'Light',
    reducedMotion: 'Reduced Motion',

    // AI Engine Settings
    aiEngineTitle: 'AI Engine',
    aiEngineSubtitle: 'Configure your response processing engine, intelligence behavior, context, and length preferences.',
    preferredModel: 'Preferred Model',
    systemPrompt: 'System Instructions / Persona',
    engineTitle: 'Engine',
    engineDesc: 'Choose how Aestific should prioritize response processing.',
    engineAuto: 'Aestific Auto',
    engineAutoDesc: 'Normal Aestific behavior (Default).',
    engineFast: 'Fast',
    engineFastDesc: 'User preference for faster responses.',
    engineDeep: 'Deep',
    engineDeepDesc: 'User preference for deeper processing.',
    intelligenceTitle: 'Intelligence',
    intelligenceDesc: 'Choose the preferred response behavior.',
    intelBalanced: 'Balanced',
    intelBalancedDesc: 'Normal response behavior (Default).',
    intelPrecise: 'Precise',
    intelPreciseDesc: 'Request clearer, more exact and technically focused responses.',
    intelCreative: 'Creative',
    intelCreativeDesc: 'Request more creative responses when appropriate.',
    contextTitle: 'Context',
    contextDesc: 'Use relevant conversation context.',
    contextOn: 'On',
    contextOnDesc: 'Allow the existing conversation-context mechanism to be used normally (Default).',
    contextOff: 'Off',
    contextOffDesc: 'Do not include optional previous conversation context for your requests.',
    responseLengthTitle: 'Response Length',
    responseLengthDesc: 'Choose the preferred response length.',
    respLenAuto: 'Auto',
    respLenAutoDesc: 'Existing Aestific default behavior.',
    respLenShort: 'Short',
    respLenShortDesc: 'Prefer concise responses.',
    respLenMedium: 'Medium',
    respLenMediumDesc: 'Prefer normal-length responses.',
    respLenDetailed: 'Detailed',
    respLenDetailedDesc: 'Prefer more comprehensive responses.',

    // Memory Settings
    memoryTitle: 'Account-Level Memory',
    memorySubtitle: 'Allow Aestific to remember key facts and preferences across chats.',
    enableMemory: 'Enable Memory',

    // Privacy Settings
    privacyTitle: 'Data & Privacy Controls',
    privacySubtitle: 'Manage your conversation history, stored data, and account lifecycle.',
    clearChats: 'Clear All Conversations',
    exportData: 'Export Data',
    deleteAccount: 'Delete Account',

    // Sidebar & Navigation
    newChat: 'New Chat',
    chats: 'Chats',
    knowledgeFiles: 'Knowledge Files',
    accountMemory: 'Account Memory',
    pictureStudio: 'AI Picture Studio',
    searchChats: 'Search chats...',
    searchConversations: 'Search chat history...',
    noConversations: 'No saved conversations yet',
    pinned: 'Pinned',
    today: 'Today',
    yesterday: 'Yesterday',
    accountPreferences: 'Account & Preferences',
    signOut: 'Sign Out',
    memories: 'Memories',
    imageStudio: 'Image Studio',
    support: 'Support & Help',
    settings: 'Settings',
    logOut: 'Log out',
    pin: 'Pin',
    unpin: 'Unpin',
    rename: 'Rename',
    deleteConv: 'Delete',

    // Chat View & Global UI
    askPlaceholder: 'Ask Aestific anything...',
    generateIntelligence: 'Generate intelligence',
    sendMessage: 'Send message',
    stopGenerating: 'Stop generating',
    howCanIHelp: 'How can I help you today?',
    copy: 'Copy',
    copied: 'Copied!',
    webSearch: 'Web Search',
    deepReasoning: 'Deep Reasoning',
    model: 'Model',
    backToChat: 'Back to Chat',
  },
  bn: {
    // Common
    save: 'সংরক্ষণ',
    saveChanges: 'পরিবর্তন সংরক্ষণ করুন',
    saving: 'সংরক্ষণ হচ্ছে...',
    saved: 'সংরক্ষিত!',
    cancel: 'বাতিল',
    delete: 'মুছে ফেলুন',
    close: 'বন্ধ করুন',
    on: 'চালু',
    off: 'বন্ধ',
    auto: 'অটো',

    // Settings Modal & Tabs
    settingsTitle: 'Aestific সেটিংস',
    settingsSubtitle: 'আপনার পরিবেশ এবং অ্যাকাউন্ট পছন্দ কাস্টমাইজ করুন',
    tabAccount: 'অ্যাকাউন্ট',
    tabAi: 'এআই ইঞ্জিন',
    tabAppearance: 'রূপ ও থিম',
    tabChat: 'চ্যাট কন্ট্রোল',
    tabExperience: 'অভিজ্ঞতা',
    tabLanguage: 'ভাষা',
    tabMemory: 'মেমোরি',
    tabPrivacy: 'প্রাইভেসি ও অ্যাকাউন্ট',
    tabDocuments: 'ডকুমেন্টস',

    // Experience Settings
    experienceTitle: 'অভিজ্ঞতা ও সংবেদনশীল নিয়ন্ত্রণ',
    experienceSubtitle: 'রেসপন্স ট্রানজিশন, ভিজ্যুয়াল এফেক্ট এবং সাউন্ড সংকেত কাস্টমাইজ করুন।',
    responseAnimation: 'রেসপন্স অ্যানিমেশন',
    responseAnimationDesc: 'চ্যাট ক্যানভাসে সহকারীর প্রতিক্রিয়া কীভাবে অ্যানিমেট হবে তা নির্ধারণ করুন।',
    animSmooth: 'স্মুথ (মসৃণ)',
    animSmoothDesc: 'টোকেন আসার সাথে সাথে তরল ট্রানজিশন ও মসৃণ স্ক্রলিং বজায় রাখে।',
    animInstant: 'ইনস্ট্যান্ট (তাৎক্ষণিক)',
    animInstantDesc: 'অ্যানিমেশন বিলম্ব কমিয়ে অবিলম্বে প্রদর্শন, স্ট্রিমিং পুরোপুরি অক্ষুণ্ণ থাকবে।',
    generationEffects: 'জেনারেশন এফেক্টস',
    generationEffectsDesc: 'স্ট্যাটাস বজায় রেখে ইমেজ তৈরির সময় অতিরিক্ত ভিজ্যুয়াল এফেক্ট নিয়ন্ত্রণ করুন।',
    genEffectsFull: 'সম্পূর্ণ (ফুল)',
    genEffectsFullDesc: 'উজ্জ্বল কণা, আলোর রেখা ও পালসসহ সম্পূর্ণ ভিজ্যুয়াল এফেক্ট।',
    genEffectsMinimal: 'মিনিমাল (সংক্ষিপ্ত)',
    genEffectsMinimalDesc: 'শান্ত ব্যাকগ্রাউন্ড ও সুনির্দিষ্ট নির্দেশকসহ ন্যূনতম প্রয়োজনীয় প্রভাব।',
    genEffectsOff: 'বন্ধ (অফ)',
    genEffectsOffDesc: 'কেবল অতিরিক্ত এফেক্ট বাদ দেওয়া হয়। তৈরির ধাপ ও স্ট্যাটাস সম্পূর্ণ দৃশ্যমান থাকে।',
    soundEffects: 'সাউন্ড এফেক্টস',
    soundEffectsDesc: 'বার্তা পাঠানো ও উত্তরের জন্য মৃদু স্থানীয় অডিও প্রতিক্রিয়া।',
    soundOn: 'চালু (অন)',
    soundOnDesc: 'বার্তা পাঠানো এবং কাজ সমাপ্তিতে মৃদু শব্দ বাজায়।',
    soundOff: 'বন্ধ (অফ)',
    soundOffDesc: 'ইন্টারফেসের সমস্ত অতিরিক্ত শব্দ নিশ্চিতভাবে বন্ধ থাকবে।',
    testSound: 'সাউন্ড পরীক্ষা করুন',

    // Language Settings
    langTabTitle: 'ভাষার পছন্দসমূহ',
    langTabSubtitle: 'আপনার ইন্টারফেস ভাষা এবং এআই মডেলের প্রতিক্রিয়া ভাষা কনফিগার করুন',
    interfaceLanguageTitle: 'ইন্টারফেস ভাষা',
    interfaceLanguageDesc: 'Aestific মেনু, বোতাম এবং সেটিংস জুড়ে ব্যবহৃত ভাষা নির্বাচন করুন।',
    responseLanguageTitle: 'প্রতিক্রিয়া ভাষা',
    responseLanguageDesc: 'কথোপকথনের প্রতিক্রিয়ার জন্য এআই কীভাবে ভাষা নির্বাচন করবে তা নির্ধারণ করুন।',
    responseAuto: 'অটো',
    responseAutoDesc: 'স্বাভাবিকভাবে ব্যবহারকারীর প্রম্পটের ভাষা অনুসরণ করে',
    responseEnglish: 'English',
    responseEnglishDesc: 'সর্বদা ইংরেজিতে উত্তর তৈরি করবে',
    responseBangla: 'বাংলা',
    responseBanglaDesc: 'সর্বদা বাংলায় (বাংলা) উত্তর তৈরি করবে',

    // Chat Controls Settings
    chatTabTitle: 'চ্যাট আচরণ ও মিথস্ক্রিয়া',
    chatTabSubtitle: 'মেসেজিং নিয়ন্ত্রণ, স্ট্রিমিং আউটপুট, অটো-স্ক্রোল এবং টাইমস্ট্যাম্পের দৃশ্যমানতা সমন্বয় করুন।',
    enterToSendTitle: 'Enter টিপে পাঠান',
    enterToSendOnDesc: 'Enter চাপলে মেসেজ পাঠানো হবে; Shift+Enter নতুন লাইন তৈরি করবে',
    enterToSendOffDesc: 'Enter চাপলে নতুন লাইন তৈরি হবে; পাঠাতে সেন্ড বোতামে ক্লিক করুন',
    streamingTitle: 'স্ট্রিমিং প্রতিক্রিয়া',
    streamingOnDesc: 'মডেল যেভাবে তৈরি করবে সেভাবে টোকেনগুলো ক্রমান্বয়ে প্রবাহিত হবে',
    streamingOffDesc: 'সম্পূর্ণ হওয়ার পর পুরো উত্তরটি একবারে প্রদর্শন করা হবে',
    autoScrollTitle: 'অটো-স্ক্রোল',
    autoScrollOnDesc: 'নতুন তৈরি হওয়া টোকেনগুলো আসার সাথে সাথে স্বয়ংক্রিয়ভাবে অনুসরণ করবে',
    autoScrollOffDesc: 'আপনার ম্যানুয়ালি নির্বাচিত স্ক্রোল পজিশন কখনো জোরপূর্বক সরাবে না',
    timestampsTitle: 'টাইমস্ট্যাম্প প্রদর্শন',
    timestampsOnDesc: 'ব্যবহারকারী এবং সহায়ক বার্তার পাশে সঠিক সময় প্রদর্শন করবে',
    timestampsOffDesc: 'চ্যাট টাইমলাইন থেকে টাইমস্ট্যাম্পের সূচকগুলো লুকিয়ে রাখবে',

    // Account Settings
    personalDetails: 'ব্যক্তিগত তথ্য',
    personalDetailsDesc: 'আপনার প্রদর্শিত নাম এবং ইমেইল ঠিকানা পরিচালনা করুন',
    fullName: 'পুরো নাম',
    emailAddress: 'ইমেইল ঠিকানা',
    changePassword: 'পাসওয়ার্ড পরিবর্তন',
    currentPassword: 'বর্তমান পাসওয়ার্ড',
    newPassword: 'নতুন পাসওয়ার্ড',
    updatePassword: 'পাসওয়ার্ড আপডেট করুন',

    // Appearance Settings
    appearanceTitle: 'ভিজ্যুয়াল থিম ও রূপ',
    appearanceSubtitle: 'আপনার পছন্দের থিম মোড এবং ভিজ্যুয়াল মোশন পছন্দ নির্বাচন করুন।',
    themeMode: 'থিম মোড',
    systemTheme: 'সিস্টেম',
    darkTheme: 'ডার্ক',
    lightTheme: 'লাইট',
    reducedMotion: 'মোশন হ্রাস করুন',

    // AI Engine Settings
    aiEngineTitle: 'এআই ইঞ্জিন',
    aiEngineSubtitle: 'আপনার রেসপন্স প্রসেসিং ইঞ্জিন, ইন্টেলিজেন্স আচরণ, প্রাসঙ্গিক কনটেক্সট এবং উত্তরের দৈর্ঘ্যের পছন্দ নির্ধারণ করুন।',
    preferredModel: 'পছন্দের মডেল',
    systemPrompt: 'সিস্টেম নির্দেশনা / পার্সোনা',
    engineTitle: 'ইঞ্জিন',
    engineDesc: 'Aestific কীভাবে প্রতিক্রিয়ার প্রসেসিংকে অগ্রাধিকার দেবে তা নির্বাচন করুন।',
    engineAuto: 'Aestific Auto',
    engineAutoDesc: 'সাধারণ Aestific আচরণ (ডিফল্ট)।',
    engineFast: 'Fast',
    engineFastDesc: 'দ্রুত প্রতিক্রিয়ার জন্য ব্যবহারকারীর পছন্দ।',
    engineDeep: 'Deep',
    engineDeepDesc: 'গভীর বিশ্লেষণের জন্য ব্যবহারকারীর পছন্দ।',
    intelligenceTitle: 'ইন্টেলিজেন্স',
    intelligenceDesc: 'পছন্দের প্রতিক্রিয়া আচরণ নির্বাচন করুন।',
    intelBalanced: 'Balanced',
    intelBalancedDesc: 'সাধারণ প্রতিক্রিয়া আচরণ (ডিফল্ট)।',
    intelPrecise: 'Precise',
    intelPreciseDesc: 'আরও স্পষ্ট, নির্ভুল এবং প্রযুক্তিগত উত্তর।',
    intelCreative: 'Creative',
    intelCreativeDesc: 'প্রয়োজনে আরও সৃজনশীল উত্তর।',
    contextTitle: 'কনটেক্সট',
    contextDesc: 'কথোপকথনের প্রাসঙ্গিক কনটেক্সট ব্যবহার করুন।',
    contextOn: 'On',
    contextOnDesc: 'কথোপকথনের প্রাসঙ্গিক কনটেক্সট স্বাভাবিকভাবে ব্যবহার করার অনুমতি দিন (ডিফল্ট)।',
    contextOff: 'Off',
    contextOffDesc: 'অনুরোধের জন্য পূর্ববর্তী কথোপকথন কনটেক্সট অন্তর্ভুক্ত করবেন না।',
    responseLengthTitle: 'রেসপন্স দৈর্ঘ্য',
    responseLengthDesc: 'পছন্দের উত্তরের দৈর্ঘ্য নির্বাচন করুন।',
    respLenAuto: 'Auto',
    respLenAutoDesc: 'বিদ্যমান স্বাভাবিক Aestific আচরণ।',
    respLenShort: 'Short',
    respLenShortDesc: 'সংক্ষিপ্ত উত্তরের অগ্রাধিকার।',
    respLenMedium: 'Medium',
    respLenMediumDesc: 'মাঝারি দৈর্ঘ্যের উত্তরের অগ্রাধিকার।',
    respLenDetailed: 'Detailed',
    respLenDetailedDesc: 'আরও বিস্তারিত ও বিস্তৃত উত্তরের অগ্রাধিকার।',

    // Memory Settings
    memoryTitle: 'অ্যাকাউন্ট-স্তরের মেমোরি',
    memorySubtitle: 'Aestific-কে চ্যাট জুড়ে মূল তথ্য এবং পছন্দগুলো মনে রাখার অনুমতি দিন।',
    enableMemory: 'মেমোরি সক্ষম করুন',

    // Privacy Settings
    privacyTitle: 'ডেটা ও প্রাইভেসি নিয়ন্ত্রণ',
    privacySubtitle: 'আপনার কথোপকথনের ইতিহাস, সংরক্ষিত ডেটা এবং অ্যাকাউন্টের জীবনচক্র পরিচালনা করুন।',
    clearChats: 'সমস্ত কথোপকথন মুছুন',
    exportData: 'ডেটা এক্সপোর্ট করুন',
    deleteAccount: 'অ্যাকাউন্ট মুছে ফেলুন',

    // Sidebar & Navigation
    newChat: 'নতুন চ্যাট',
    chats: 'চ্যাটসমূহ',
    knowledgeFiles: 'নলেজ ফাইলসমূহ',
    accountMemory: 'অ্যাকাউন্ট মেমোরি',
    pictureStudio: 'এআই পিকচার স্টুডিও',
    searchChats: 'চ্যাট খুঁজুন...',
    searchConversations: 'চ্যাট ইতিহাস অনুসন্ধান করুন...',
    noConversations: 'এখনও কোনো কথোপকথন সংরক্ষিত নেই',
    pinned: 'পিন করা',
    today: 'আজ',
    yesterday: 'গতকাল',
    accountPreferences: 'অ্যাকাউন্ট ও পছন্দসমূহ',
    signOut: 'সাইন আউট',
    memories: 'মেমোরিসমূহ',
    imageStudio: 'ইমেজ স্টুডিও',
    support: 'সহায়তা ও হেল্প',
    settings: 'সেটিংস',
    logOut: 'লগ আউট',
    pin: 'পিন করুন',
    unpin: 'আনপিন করুন',
    rename: 'নাম পরিবর্তন',
    deleteConv: 'মুছে ফেলুন',

    // Chat View & Global UI
    askPlaceholder: 'Aestific-কে যেকোনো কিছু জিজ্ঞাসা করুন...',
    generateIntelligence: 'ইন্টেলিজেন্স তৈরি করুন',
    sendMessage: 'বার্তা পাঠান',
    stopGenerating: 'থামুন',
    howCanIHelp: 'আজ আপনাকে কীভাবে সাহায্য করতে পারি?',
    copy: 'কপি করুন',
    copied: 'কপি হয়েছে!',
    webSearch: 'ওয়েব অনুসন্ধান',
    deepReasoning: 'গভীর যুক্তি',
    model: 'মডেল',
    backToChat: 'চ্যাটে ফিরে যান',
  },
};
