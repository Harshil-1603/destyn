"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useSession } from "next-auth/react";
import BlockConfirmModal from "./BlockConfirmModal";
import ReportModal from "./ReportModal";


import { useCallback } from "react";
import { useRouter } from "next/navigation";

const SOCKET_URL = typeof window !== "undefined" ? window.location.origin : "";

export default function Chat() {
  const { data: session } = useSession();
  const [newMatches, setNewMatches] = useState<any[]>([]);
  const [activeChats, setActiveChats] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null); // For selected user's profile
  const [currentUserProfile, setCurrentUserProfile] = useState<any | null>(null); // For current user's profile
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'new' | 'chats'>('new'); // Track which tab is active
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sentMessagesRef = useRef<Set<string>>(new Set());
  const [lastMessages, setLastMessages] = useState<Record<string, any>>({}); // email -> last message

  const router = useRouter();

  // Check screen size for responsive layout
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    // Initial check
    checkIfMobile();

    // Listen for resize events
    window.addEventListener("resize", checkIfMobile);

    // Cleanup
    return () => window.removeEventListener("resize", checkIfMobile);
  }, []);

  // Auto-scroll to bottom
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // When messages change (new message), scroll smoothly
  useEffect(() => {
    scrollToBottom("smooth");
  }, [messages]);

  // When opening a chat (selected changes), scroll instantly
  useEffect(() => {
    if (selected) scrollToBottom("auto");
  }, [selected]);

  // Fetch matches on mount
  useEffect(() => {
    if (!session?.user?.email) return;
    fetch("/api/get-matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: session.user.email }),
    })
      .then((res) => res.json())
      .then((data) => {
        setNewMatches(data.newMatches || []);
        setActiveChats(data.activeChats || []);
      });
  }, [session?.user?.email]);

  // Fetch blocked users on mount and after blocking
  useEffect(() => {
    if (!session?.user?.email) return;
    fetch(
      `/api/block-user?blockerEmail=${encodeURIComponent(session.user.email)}`
    )
      .then((res) => res.json())
      .then((data) => {
        setBlockedUsers(data.blocked || []);
      });
  }, [session?.user?.email]);

  // Fetch current user profile
  useEffect(() => {
    if (!session?.user?.email) return;
    fetch("/api/get-user-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: session.user.email }),
    })
      .then((res) => res.json())
      .then((data) => {
        setCurrentUserProfile(data);
      });
  }, [session?.user?.email]);

  // Fetch selected user profile
  useEffect(() => {
    if (!selected?.email) {
      setSelectedProfile(null);
      return;
    }
    fetch("/api/get-user-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: selected.email }),
    })
      .then((res) => res.json())
      .then((data) => {
        setSelectedProfile(data);
      });
  }, [selected]);

  // Determine if selected user is blocked
  const isBlocked = selected && blockedUsers.includes(selected.email);

  // Setup socket connection and listeners
  useEffect(() => {
    if (!session?.user?.email || !selected) return;
    if (isBlocked) return; // Do not set up socket if blocked

    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    // Join a unique room for this chat (sorted emails for consistency)
    const room = [session.user.email, selected.email].sort().join("--");
    socket.emit("join", room);

    socket.on("chat message", (msg) => {
      // Only add messages for this room and not already sent by this user
      if (
        [msg.sender, msg.receiver].includes(session.user.email) &&
        [msg.sender, msg.receiver].includes(selected.email) &&
        !sentMessagesRef.current.has(`${msg.timestamp}-${msg.message}`)
      ) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [session?.user?.email, selected, isBlocked]);

  // Fetch chat history when a match is selected
  useEffect(() => {
    if (!session?.user?.email || !selected) return;

    setLoading(true);
    fetch("/api/get-chat-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userEmail: session.user.email,
        otherUserEmail: selected.email,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        setMessages(data.messages || []);
        setLoading(false);
      })
      .catch(() => {
        setMessages([]);
        setLoading(false);
      });
  }, [selected, session?.user?.email]);

  // Fetch last message for each active chat
  useEffect(() => {
    if (!session?.user?.email || activeChats.length === 0) return;
    const fetchLastMessages = async () => {
      const results: Record<string, any> = {};
      await Promise.all(
        activeChats.map(async (user: any) => {
          const usersSorted = [session.user.email, user.email].sort();
          const room = usersSorted.join("--");
          const res = await fetch("/api/get-chat-history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userEmail: session.user.email, otherUserEmail: user.email, limit: 1, sort: -1 }),
          });
          const data = await res.json();
          if (data.messages && data.messages.length > 0) {
            results[user.email] = data.messages[data.messages.length - 1];
          }
        })
      );
      setLastMessages(results);
    };
    fetchLastMessages();
  }, [activeChats, session?.user?.email]);

  const sendMessage = async () => {
    if (!input.trim() || !session?.user?.email || !selected) return;
    
    const room = [session.user.email, selected.email].sort().join("--");
    const msg = {
      room,
      sender: session.user.email,
      receiver: selected.email,
      message: input,
      timestamp: new Date().toISOString(),
    };

    try {
      // First store the message in MongoDB
      const response = await fetch("/api/save-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg),
      });

      if (!response.ok) {
        throw new Error("Failed to save message");
      }

      // Mark this message as sent to prevent duplicates
      sentMessagesRef.current.add(`${msg.timestamp}-${msg.message}`);

      // Then emit through socket
      socketRef.current?.emit("chat message", msg);
      setMessages((prev) => [...prev, msg]);
      setInput("");

      // Refresh matches to update the categorization
      setTimeout(() => {
        fetch("/api/get-matches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: session.user.email }),
        })
          .then((res) => res.json())
          .then((data) => {
            setNewMatches(data.newMatches || []);
            setActiveChats(data.activeChats || []);
          });
      }, 1000);
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message. Please try again.");
    }
  };

  // Function to go back to matches list on mobile
  const handleBackToMatches = () => {
    setSelected(null);
  };

  // Function to get similarities
  const getSimilarities = useCallback((arr1: string[] = [], arr2: string[] = []) => {
    return arr1.filter((item) => arr2.includes(item));
  }, []);

  // Get the current list based on active tab
  const getCurrentList = () => {
    return activeTab === 'new' ? newMatches : activeChats;
  };

  // Get the title for the current tab
  const getTabTitle = () => {
    return activeTab === 'new' ? 'New Matches' : 'Chats';
  };

  return (
    <div
      style={{
        display: "flex",
        height: "calc(100vh - 150px)", // Reduced height to account for navbar and bottom bar
        maxWidth: 800,
        margin: "0 auto",
        border: "1px solid #333",
        borderRadius: 0, // Changed from 12 to 0 to remove rounded corners
        overflow: "hidden",
        background: "#0a0a0a",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        flexDirection: isMobile ? "column" : "row",
      }}
    >
      {/* Sidebar with matches - Hidden on mobile when chat is selected */}
      {(!isMobile || (isMobile && !selected)) && (
        <div
          style={{
            width: isMobile ? "100%" : 250,
            borderRight: isMobile ? "none" : "1px solid #333",
            borderBottom: isMobile ? "1px solid #333" : "none",
            background: "#111",
            display: "flex",
            flexDirection: "column",
            height: isMobile ? "auto" : "100%",
            flex: isMobile ? "1" : "none",
          }}
        >
          <div
            style={{
              padding: 20,
              borderBottom: "1px solid #333",
              background: "#000",
              color: "#fff",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
              💬 Matches
            </h3>
          </div>

          {/* Tab Navigation */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid #333",
              background: "#0a0a0a",
            }}
          >
            <button
              onClick={() => setActiveTab('new')}
              style={{
                flex: 1,
                padding: "12px 16px",
                background: activeTab === 'new' ? "#0070f3" : "transparent",
                color: activeTab === 'new' ? "#fff" : "#666",
                border: "none",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "600",
                transition: "all 0.2s",
              }}
            >
              New Matches ({newMatches.length})
            </button>
            <button
              onClick={() => setActiveTab('chats')}
              style={{
                flex: 1,
                padding: "12px 16px",
                background: activeTab === 'chats' ? "#0070f3" : "transparent",
                color: activeTab === 'chats' ? "#fff" : "#666",
                border: "none",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "600",
                transition: "all 0.2s",
              }}
            >
              Chats ({activeChats.length})
            </button>
          </div>

          <div
            style={{
              padding: 12,
              flex: 1,
              overflowY: "auto",
              maxHeight: isMobile ? "calc(100vh - 280px)" : "auto",
            }}
          >
            {getCurrentList().length === 0 && (
              <div
                style={{
                  padding: 20,
                  textAlign: "center",
                  color: "#666",
                  fontSize: "14px",
                }}
              >
                {activeTab === 'new' 
                  ? "Still a lil dry in here, go like some cuties..."
                  : "Still waiting on that first “hey 👋” — go make a move!"
                }
              </div>
            )}
            {getCurrentList().map((user: any, index: number) => (
              <div
                key={`${user.email}-${index}`}
                style={{
                  padding: 16,
                  margin: "8px 0",
                  borderRadius: 10,
                  background:
                    selected?.email === user.email ? "#1a1a1a" : "#0a0a0a",
                  cursor: "pointer",
                  border:
                    selected?.email === user.email
                      ? "2px solid #0070f3"
                      : "1px solid #333",
                  transition: "all 0.2s",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
                onClick={() => setSelected(user)}
              >
                {/* Profile Photo */}
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "#1a1a1a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid #333",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  {user.profilePhoto ? (
                    <img
                      src={user.profilePhoto}
                      alt={`${user.name || user.email}'s profile`}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: "16px", color: "#666" }}>👤</span>
                  )}
                </div>

                {/* User Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: "600",
                      fontSize: "14px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {user.name || user.email}
                  </div>
                  {activeTab === 'new' && (
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#0070f3",
                        marginTop: "2px",
                      }}
                    >
                      ✨ New match!
                    </div>
                  )}
                  {activeTab === 'chats' && lastMessages[user.email] && (
                    <div
                      style={{
                        fontSize: "12px",
                        color: '#ccc',
                        marginTop: 2,
                        fontWeight:
                          lastMessages[user.email].sender !== session?.user?.email && !lastMessages[user.email].read
                            ? 'bold'
                            : 'normal',
                      }}
                    >
                      {lastMessages[user.email].sender === session?.user?.email ? 'You: ' : ''}
                      {lastMessages[user.email].message}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat area */}
      {(!isMobile || (isMobile && selected)) && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: "#0a0a0a",
            height: isMobile ? "calc(100vh - 120px)" : "auto",
            position: "relative",
            paddingTop: isMobile ? 35 : 0, // Add top padding to prevent overlap with sticky navbar
          }}
        >
          {selected ? (
            <>
              <div
                style={{
                  padding: 20,
                  borderBottom: "1px solid #333",
                  background: "#111",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {isMobile && (
                      <button
                        onClick={handleBackToMatches}
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "50%",
                          background: "#222",
                          border: "1px solid #333",
                          color: "#0070f3",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          marginRight: 8,
                          transition: "background 0.2s, border-color 0.2s, color 0.2s",
                          fontSize: "20px",
                        }}
                        onMouseEnter={e => {
                          (e.target as HTMLButtonElement).style.background = "#333";
                          (e.target as HTMLButtonElement).style.color = "#fff";
                          (e.target as HTMLButtonElement).style.borderColor = "#0070f3";
                        }}
                        onMouseLeave={e => {
                          (e.target as HTMLButtonElement).style.background = "#222";
                          (e.target as HTMLButtonElement).style.color = "#0070f3";
                          (e.target as HTMLButtonElement).style.borderColor = "#333";
                        }}
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M15 19L8 12L15 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    )}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontWeight: "600",
                        fontSize: "16px",
                        marginBottom: 4,
                        cursor: "pointer",
                        // Remove underline
                        textDecoration: "none",
                      }}
                      onClick={() => {
                        if (selected?.email) {
                          router.push(`/mainpage/user-profile?email=${encodeURIComponent(selected.email)}`);
                        }
                      }}
                    >
                      {/* Profile Photo */}
                      {selectedProfile?.profilePhoto ? (
                        <img
                          src={selectedProfile.profilePhoto}
                          alt={`${selected.name || selected.email}'s profile`}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            objectFit: 'cover',
                            background: '#1a1a1a',
                            border: '1px solid #333',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <span style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: '#1a1a1a',
                          border: '1px solid #333',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 18,
                          color: '#666',
                          flexShrink: 0,
                        }}>👤</span>
                      )}
                      {/* User Name */}
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected.name}</span>
                    </div>
                    {/* Show if this is a new match */}
                    {newMatches.find(match => match.email === selected.email) && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#0070f3",
                          fontWeight: "500",
                        }}
                      >
                        ✨ New match - send a message to start chatting!
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  paddingBottom: isMobile ? 120 : 0, // Add enough padding for input + nav on mobile
                }}
              >
                {messages.find((msg) => msg.sender === 'system') && (
                  <div
                    className="chat-system-message"
                    style={{
                      background: "linear-gradient(90deg, #a1c4fd 0%, #c2e9fb 100%)",
                      color: "#222",
                      padding: "16px 28px",
                      borderRadius: "18px",
                      margin: "0 auto 18px auto",
                      textAlign: "center",
                      fontStyle: "italic",
                      fontWeight: 600,
                      maxWidth: 420,
                      fontSize: 18,
                      boxShadow: "0 2px 16px rgba(100,180,255,0.10)",
                      display: "block",
                      whiteSpace: "pre-line"
                    }}
                  >
                    {messages.find((msg) => msg.sender === 'system')?.message}
                  </div>
                )}
                {loading && (
                  <div
                    style={{
                      textAlign: "center",
                      padding: 20,
                      color: "#666",
                      fontSize: "14px",
                    }}
                  >
                    Loading chat history...
                  </div>
                )}

                {messages.filter((msg, idx) => msg.sender !== 'system' || idx !== messages.findIndex(m => m.sender === 'system')).map((msg, idx) => (
                  <div
                    key={`${msg.timestamp}-${idx}`}
                    style={{ margin: "12px 0" }}
                  >
                    <div
                      style={{
                        textAlign:
                          msg.sender === session?.user?.email ? "right" : "left",
                        maxWidth: isMobile ? "85%" : "70%",
                        margin:
                          msg.sender === session?.user?.email
                            ? "0 0 0 auto"
                            : "0 auto 0 0",
                        marginLeft:
                          msg.sender !== session?.user?.email ? (isMobile ? 8 : 20) : undefined,
                      }}
                    >
                      <div
                        style={{
                          padding: "12px 16px",
                          borderRadius: 18,
                          background:
                            msg.sender === session?.user?.email
                              ? "#0070f3"
                              : "#1a1a1a",
                          color:
                            msg.sender === session?.user?.email
                              ? "white"
                              : "#fff",
                          border:
                            msg.sender === session?.user?.email
                              ? "none"
                              : "1px solid #333",
                          display: "inline-block",
                          wordBreak: "break-word",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                        }}
                      >
                        {msg.message}
                      </div>

                      {/* Message Reactions - Always show existing reactions */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            gap: "4px",
                            marginTop: "8px",
                            flexWrap: "wrap",
                            justifyContent:
                              msg.sender === session?.user?.email
                                ? "flex-end"
                                : "flex-start",
                          }}
                        >
                          {Object.entries(msg.reactions).map(
                            ([reaction, count]) => (
                              <span
                                key={reaction}
                                style={{
                                  background: "rgba(0,0,0,0.7)",
                                  padding: "4px 8px",
                                  borderRadius: "12px",
                                  fontSize: "12px",
                                  color: "#fff",
                                  border: "1px solid rgba(255,255,255,0.1)",
                                }}
                              >
                                {reaction} {String(count)}
                              </span>
                            )
                          )}
                        </div>
                      )}

                      <div
                        style={{
                          fontSize: "10px",
                          color: "#666",
                          marginTop: 6,
                          textAlign:
                            msg.sender === session?.user?.email
                              ? "right"
                              : "left",
                        }}
                      >
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat input box - fixed on mobile */}
              <div
                style={
                  isMobile
                    ? {
                        position: "fixed",
                        left: 0,
                        right: 0,
                        bottom: 56, // Height of bottom nav (adjust if needed)
                        zIndex: 1001,
                        padding: "12px",
                        borderTop: "1px solid #333",
                        background: "#111",
                      }
                    : {
                        padding: "20px",
                        borderTop: "1px solid #333",
                        background: "#111",
                      }
                }
              >
                <div style={{ display: "flex", gap: isMobile ? 8 : 12 }}>
                  <input
                    style={{
                      flex: 1,
                      padding: isMobile ? "10px 16px" : "14px 20px",
                      borderRadius: 25,
                      border: "1px solid #333",
                      background: "#0a0a0a",
                      color: "#fff",
                      outline: "none",
                      fontSize: isMobile ? "14px" : "16px",
                      transition: "border-color 0.2s",
                    }}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isBlocked) sendMessage();
                    }}
                    onFocus={(e) =>
                      ((e.target as HTMLInputElement).style.borderColor =
                        "#0070f3")
                    }
                    onBlur={(e) =>
                      ((e.target as HTMLInputElement).style.borderColor = "#333")
                    }
                    placeholder={isBlocked ? "You have blocked this user. You cannot send messages." : "Type a message..."}
                    disabled={isBlocked}
                  />
                  <button
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "50%",
                      background: isBlocked || !input.trim() ? "#666" : "linear-gradient(135deg, #25D366, #128C7E)",
                      color: "white",
                      border: "none",
                      cursor: isBlocked || !input.trim() ? "not-allowed" : "pointer",
                      opacity: isBlocked ? 0.6 : 1,
                      transition: "all 0.2s ease",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      padding: 0,
                      boxShadow: !isBlocked && input.trim() ? "0 2px 8px rgba(0, 0, 0, 0.2)" : "none",
                    }}
                    onClick={() => { if (!isBlocked && input.trim()) sendMessage(); }}
                    disabled={isBlocked || !input.trim()}
                    onMouseEnter={(e) =>
                      ((e.target as HTMLButtonElement).style.background =
                        isBlocked || !input.trim() ? "#666" : "#128C7E")
                    }
                    onMouseLeave={(e) =>
                      ((e.target as HTMLButtonElement).style.background =
                        isBlocked || !input.trim() ? "#666" : "linear-gradient(135deg, #25D366, #128C7E)")
                    }
                  >
                    {/* WhatsApp-style paper plane icon */}
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      width="20" 
                      height="20" 
                      viewBox="0 0 24 24" 
                      fill="white"
                      style={{ display: "block" }}
                    >
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </button>
                </div>
              </div>
              <BlockConfirmModal
                open={blockModalOpen}
                onClose={() => setBlockModalOpen(false)}
                onConfirm={async () => {
                  setBlockModalOpen(false);
                  if (!session?.user?.email || !selected?.email) return;
                  await fetch("/api/block-user", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      blockerEmail: session.user.email,
                      blockedEmail: selected.email,
                      action: "block",
                    }),
                  });
                  // Refetch blocked users after blocking
                  const res = await fetch(
                    `/api/block-user?blockerEmail=${encodeURIComponent(
                      session.user.email
                    )}`
                  );
                  const data = await res.json();
                  setBlockedUsers(data.blocked || []);
                  setSelected(null);
                }}
                userEmail={selected?.email || ""}
              />
              <ReportModal
                open={reportModalOpen}
                onClose={() => setReportModalOpen(false)}
                onSubmit={async (reason, details) => {
                  setReportModalOpen(false);
                  if (!session?.user?.email || !selected?.email) return;
                  await fetch("/api/report", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      reporterEmail: session.user.email,
                      reportedUserEmail: selected.email,
                      reason,
                      details,
                    }),
                  });
                  alert("Report submitted. Thank you!");
                  // Instantly remove the match and clear chat
                  setNewMatches((prev) => prev.filter((u) => u.email !== selected.email));
                  setActiveChats((prev) => prev.filter((u) => u.email !== selected.email));
                  setSelected(null);
                }}
                type="user"
                targetEmail={selected?.email || ""}
              />
            </>
          ) : (
            <div
              style={{
                padding: 40,
                color: "#888",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                background: "#0a0a0a",
              }}
            >
              <div
                style={{
                  fontSize: "64px",
                  marginBottom: 20,
                  opacity: 0.5,
                }}
              >

                💬
              </div>
              <div
                style={{
                  fontSize: "20px",
                  marginBottom: 12,
                  color: "#fff",
                  fontWeight: "600",
                }}
              >
                {isMobile ? "Your next fav convo is one tap away—go for it " : "Your next fav convo is one tap away—go for it "}
              </div>
              <div
                style={{
                  fontSize: "14px",
                  color: "#666",
                  maxWidth: 300,
                }}
              >
                Your chats will pop up once the vibes are mutual...
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
