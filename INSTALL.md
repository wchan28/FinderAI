# Installing FinderAI

Thank you for testing FinderAI! This guide will help you install and run the app on your computer.

## Download

Download the latest version for your operating system from the [Releases page](../../releases).

- **Mac**: Download `FinderAI-x.x.x.dmg`
- **Windows**: Download `FinderAI-x.x.x-Setup.exe`

## macOS Installation

Since FinderAI is not signed with an Apple Developer certificate (we're still in beta testing), macOS will show a security warning. Here's how to open it:

### Method 1: Right-Click to Open (Recommended)

1. Download and open the `.dmg` file
2. Drag **FinderAI** to your **Applications** folder
3. Open **Finder** and go to **Applications**
4. **Right-click** (or Control-click) on **FinderAI**
5. Select **Open** from the menu
6. In the dialog that appears, click **Open**

The app will now open and macOS will remember your choice for future launches.

### Method 2: System Settings

If Method 1 doesn't work:

1. Try to open FinderAI normally (double-click)
2. When blocked, go to **System Settings** > **Privacy & Security**
3. Scroll down to find a message about FinderAI being blocked
4. Click **Open Anyway**
5. Enter your password if prompted

### Method 3: Terminal (Advanced)

Open Terminal and run:

```bash
xattr -cr /Applications/FinderAI.app
```

Then open FinderAI normally.

## Windows Installation

Windows SmartScreen may show a warning for apps from unknown publishers. Here's how to proceed:

### When You See "Windows protected your PC"

1. Click **More info**
2. Click **Run anyway**

The app will install and run normally. Windows will remember this choice.

### If Windows Defender Blocks It

1. Open **Windows Security**
2. Go to **Virus & threat protection**
3. Click **Protection history**
4. Find the FinderAI entry and select **Allow**

## First Launch

When you first open FinderAI:

1. The app will start automatically
2. You may need to sign in with your account
3. Select a folder to index for searching
4. Wait for indexing to complete (this may take a few minutes depending on folder size)

## Troubleshooting

### App won't start

- **Mac**: Make sure you followed the security steps above
- **Windows**: Check if antivirus software is blocking the app
- Try restarting your computer

### Indexing is slow

- Large folders with many files take longer to index
- The app works in the background - you can minimize it

### Need help?

Contact the developer or open an issue on GitHub.

---

*FinderAI is currently in beta testing. Thank you for your feedback!*
