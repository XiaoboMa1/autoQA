
# Axure-to-Playwright QA Agent (SPA) : Automated Testing System From Axure Prototypes to Browser Execution**

![这是图片](/screenshots/demo1.gif "demo")

This project is a full-stack implementation that bridges the gap between **Design (Axure)** and **Automation (Playwright)**. Instead of manually writing test scripts, it parses HTML prototypes, uses LLMs to generate structured test cases, and executes them via the Model Context Protocol (MCP).

---

## 🛠️ Tech Stack

*   **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Ant Design.
*   **Backend**: Node.js, Express, TypeScript.
*   **Database**: MySQL 8.0+ (Data Storage), Prisma ORM.
*   **Vector Database**: Qdrant (RAG Knowledge Base).
*   **AI/LLM**: OpenRouter API (GPT-4o/Claude), Aliyun DashScope (Embeddings).
*   **Automation**: Playwright, Model Context Protocol (MCP).
*   **Infrastructure**: Docker (for Qdrant).

---

## 1. The Complete User Workflow

Unlike standard automation tools, this system does not start with writing code. The workflow is strictly defined as follows:

### Phase 1: Ingestion & Generation
1.  **Upload Prototype**: The user uploads an **Axure HTML export** (zip/folder) to the system.
2.  **Parsing**: The backend (`axureParseService.ts`) uses Cheerio to extract the DOM structure, interactive elements (buttons, inputs), and annotations from the HTML.
3.  **AI Generation**: The system sends the parsed structure to an LLM. Using RAG (Retrieval-Augmented Generation), it retrieves relevant business rules from Qdrant and generates **Functional Test Cases** (steps, expected results).
4.  **Human Review**: The user reviews the AI-generated test cases in a "Draft" mode, edits steps if necessary, and saves them to the permanent library.

### Phase 2: Execution & Feedback
5.  **Trigger**: The user selects a test case (or a suite) to run.
6.  **Translation**: The system converts the natural language steps (e.g., "Click the Login button") into MCP Commands.
7.  **Execution**: The **Adaptive Scheduler** allocates a browser instance. The MCP Client drives Playwright to interact with the live web application.
8.  **Observation**: The system streams real-time MJPEG video and logs back to the frontend via WebSocket.
9.  **Result**: Upon failure or completion, artifacts (Screenshots, Traces, Videos) are saved for debugging.

---

## 2. Key Technical Implementations

### 2.1 Axure HTML Parser & Context Injection
*   **Challenge**: Raw HTML from Axure is messy and unstructured.
*   **Solution**: A custom parser (`axureParseService.ts`) identifies interactive zones versus static content. It extracts text labels associated with inputs to create semantic context for the LLM, ensuring the generated test cases use business terminology (e.g., "Submit Order") rather than generic CSS selectors.

### 2.2 Resource-Adaptive Concurrency Control
*   **Challenge**: Running multiple Playwright instances on a single machine easily leads to OOM (Out of Memory) crashes or CPU thrashing.
*   **Solution**: A dual-layer scheduler (`QueueService.ts`):
    *   **User Quota**: Limits concurrent tasks per user to ensure fairness.
    *   **System Circuit Breaker**: Monitors Node.js Event Loop Lag and OS Free Memory in real-time. If the system is under stress (e.g., Lag > 100ms), it forcefully throttles the global concurrency limit, queuing new tasks until resources recover.

### 2.3 Multi-Source Knowledge Isolation
*   **Challenge**: When testing multiple distinct business systems (e.g., "Supply Chain" vs. "CRM"), the LLM often hallucinates by applying rules from System A to System B.
*   **Solution**: Strict data isolation in the Vector Database. Each business system is assigned a unique Qdrant Collection (`test_knowledge_{systemName}`). During generation, the RAG retriever is strictly bound to the current system's namespace, preventing context pollution.

---

## 3. Local Deployment Guide

**⚠️ Prerequisites**:
*   **MySQL 8.0+** must be installed and running.
*   **Docker** is required for the Vector Database.
*   **Node.js v18+**.

### Step 1: Database Initialization
You must create the SQL database manually before starting the application.
```sql
-- Log in to your MySQL instance
CREATE DATABASE autoQA CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Step 2: Infrastructure (Vector DB)
Start Qdrant using Docker. This is required for the RAG functionality.
```bash
docker run -d -p 6333:6333 -v $(pwd)/qdrant_storage:/qdrant/storage qdrant/qdrant
```

### Step 3: Configuration
1.  Clone the repo.
2.  Create a `.env` file in the root directory:
    ```ini
    # App
    PORT=3001
    NODE_ENV=development
    
    # Database (Match Step 1 credentials)
    DATABASE_URL="mysql://root:your_password@localhost:3306/autoQA"
    
    # AI Services
    OPENROUTER_API_KEY=sk-xxxx
    OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
    DEFAULT_MODEL=openai/gpt-4o
    
    # Embedding (Aliyun DashScope or OpenAI compatible)
    EMBEDDING_PROVIDER=aliyun
    EMBEDDING_API_KEY=sk-xxxx
    EMBEDDING_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
    
    # Vector DB
    QDRANT_URL=http://localhost:6333
    
    # Security
    JWT_SECRET=change_this_to_a_random_string
    ```

### Step 4: Installation & Migration
```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers
npx playwright install chromium

# 3. Run Database Migrations (Expected Output: `Already in sync` or `Generated Prisma Client`)
npx prisma migrate dev

# 5. Seed Initial Data (Creates default admin user)
npx tsx scripts/create-admin.ts
```

### Step 5: Launch
You need to run both the backend and frontend.

*   Backend: `npm run dev:server` 
*   Frontend: `npm run dev:frontend`

Access the UI at `http://localhost:5173`.
*   **Default Admin**: `admin` / `admin` (Created via seed script).

### 4. Troubleshooting

*   **"Can't reach database server"**: Check if your MySQL service is running and the `DATABASE_URL` in `.env` is correct.
*   **"Qdrant connection refused"**: Ensure the Docker container is running (`docker ps`).
*   **"Browser closed unexpectedly"**: This often happens on low-memory machines. The Adaptive Scheduler should handle this, but ensure you have at least 8GB RAM available.

---

## 5. License

MIT License.