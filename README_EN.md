# Konnect

English | [中文](./README.md)

<p align="center">
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/Tauri-2.0-orange" alt="Tauri">
  <img src="https://img.shields.io/badge/React-18-blue" alt="React">
</p>

A lightweight modern terminal tool built with Tauri + React + TypeScript. Designed for developers and DevOps engineers, providing a fast and secure remote connection experience.

## ✨ Features

### 🚀 Core Features

| Feature | Description |
|---------|-------------|
| ⚡ **High Performance** | Built with Rust, startup time < 1s, memory usage < 50MB |
| 💻 **Local Terminal** | Full local shell support, compatible with zsh, bash, etc. |
| 🔐 **SSH Connection** | Password and SSH key authentication (RSA, Ed25519) |
| 🔑 **MFA Support** | Keyboard-Interactive authentication (Alibaba Cloud Bastion, Google Authenticator, etc.) |
| 📁 **SFTP File Manager** | Built-in file browser with upload, download, delete |
| 💾 **Connection Manager** | Persistent connection configs with one-click access |
| 🔄 **Session Restore** | Automatically restore terminal tabs after app restart |

### 🎨 UI Features

- **Dark Theme** - Modern design language inspired by Warp
- **Multi-Tab** - Manage multiple terminal sessions simultaneously
- **Split View** - Terminal and SFTP side by side
- **Real-time Status** - Connection status and transfer progress display

## 🖥️ Screenshots
![Konnect 主界面](doc/20260111151558.png)

## 🚀 Getting Started

### Requirements

- **Node.js** 18.0 or higher
- **Rust** 1.70.0 or higher
- **System Dependencies**
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools
  - Linux: `build-essential`, `libwebkit2gtk-4.1-dev`, `libssl-dev`

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/konnect.git
   cd konnect
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm run tauri dev
   ```

4. **Build for production**
   ```bash
   npm run tauri build
   ```

## 📁 Project Structure

```
konnect/
├── src/                    # React frontend code
│   ├── components/         # UI components
│   │   ├── Terminal.tsx    # Terminal component
│   │   ├── SftpExplorer.tsx # SFTP file browser
│   │   └── ConnectionDialog.tsx # Connection dialog
│   ├── store/              # State management
│   ├── types/              # TypeScript type definitions
│   └── App.tsx             # Main app entry
├── src-tauri/              # Rust backend code
│   ├── src/
│   │   ├── terminal/       # Local terminal module
│   │   ├── ssh/            # SSH connection module
│   │   ├── sftp/           # SFTP file management module
│   │   ├── config/         # Configuration storage module
│   │   └── lib.rs          # App entry point
│   └── Cargo.toml          # Rust dependencies
└── package.json            # Node.js dependencies
```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend Framework** | React 18 + TypeScript |
| **Styling** | TailwindCSS |
| **Terminal Rendering** | Xterm.js |
| **Desktop Framework** | Tauri 2.0 |
| **Backend Language** | Rust |
| **SSH/SFTP** | russh 0.56 + russh-sftp |
| **Terminal Emulation** | portable-pty |

## 🤝 Contributing

Issues and Pull Requests are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- Code style follows ESLint and Rustfmt standards
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
- New features should include corresponding tests

## 📄 License

This project is licensed under the [MIT License](./LICENSE).

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - Cross-platform desktop app framework
- [Xterm.js](https://xtermjs.org/) - Terminal emulator
- [russh](https://github.com/warp-tech/russh) - SSH protocol implementation
- [Warp](https://www.warp.dev/) - UI design inspiration

---

<p align="center">Made with ❤️ by the Konnect Team</p>
