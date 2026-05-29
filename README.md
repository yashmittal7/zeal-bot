🚀 Zeal BotAn AI-powered chatbot and automation platform built to deliver fast, intelligent, and scalable conversations.
✨ Features🤖 AI-powered chatbot responses
⚡ Fast and lightweight architecture
🔐 Secure API handling
📱 Responsive frontend UI
🧠 Context-aware conversations
🌐 REST API integration
📊 Scalable backend structure
🎨 Modern clean interface
🛠️ Tech StackFrontendReact.js
Vite
Tailwind CSS
BackendNode.js
Express.js
AI / APIsOpenAI API
REST APIs
📂 Project Structurezeal-bot/
│
├── frontend/          # Frontend application
├── backend/           # Backend server
├── public/            # Static assets
├── src/               # Main source files
├── package.json
├── vite.config.js
└── README.md⚙️ Installation1️⃣ Clone the repositorygit clone https://github.com/yashmittal7/zeal-bot.git
cd zeal-bot2️⃣ Install dependenciesnpm installIf the project contains separate frontend/backend folders:
cd frontend
npm install

cd ../backend
npm install▶️ Running the ProjectStart development servernpm run devOr for separate frontend/backend setup:
# Backend
cd backend
npm run dev

# Frontend
cd frontend
npm run dev🔑 Environment VariablesCreate a .env file in the root directory.
Example:
VITE_OPENAI_API_KEY=your_api_key
PORT=5000
