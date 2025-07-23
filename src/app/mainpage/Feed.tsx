"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

interface Confession {
  _id: string;
  confession: string;
  createdAt: string;
  likes: number;
  comments: Array<{
    id: string;
    comment: string;
    userEmail: string;
    userName: string;
    createdAt: string;
  }>;
}

export default function Feed() {
  const { data: session } = useSession();
  const [confessions, setConfessions] = useState<Confession[]>([]);
  const [newConfession, setNewConfession] = useState("");
  const [commentText, setCommentText] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch confessions on mount
  useEffect(() => {
    fetchConfessions();
  }, []);

  const fetchConfessions = async () => {
    try {
      const response = await fetch("/api/get-confessions");
      const data = await response.json();
      setConfessions(data.confessions || []);
    } catch (error) {
      console.error("Error fetching confessions:", error);
    }
  };

  const handleSubmitConfession = async () => {
    if (!newConfession.trim() || !session?.user?.email) return;

    setLoading(true);
    try {
      const response = await fetch("/api/create-confession", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confession: newConfession.trim(),
          userEmail: session.user.email,
        }),
      });

      if (response.ok) {
        setNewConfession("");
        fetchConfessions(); // Refresh the feed
      }
    } catch (error) {
      console.error("Error creating confession:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async (confessionId: string) => {
    if (!commentText.trim() || !session?.user?.email) return;

    try {
      const response = await fetch("/api/add-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confessionId,
          comment: commentText.trim(),
          userEmail: session.user.email,
          userName: session.user.name || session.user.email,
        }),
      });

      if (response.ok) {
        setCommentText("");
        setReplyingTo(null);
        fetchConfessions(); // Refresh the feed
      } else {
        const errorData = await response.json();
        console.error("Error response:", errorData);
      }
    } catch (error) {
      console.error("Error adding comment:", error);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return "Just now";
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div
      style={{
        maxWidth: 800,
        margin: "0 auto",
        padding: "20px",
        background: "transparent", // Changed from gradient to transparent
        minHeight: "calc(100vh - 40px)",
        borderRadius: "16px",
        // Removed box shadow for cleaner transparent look
      }}
    >
      {/* Minimal Confession Input */}
      <div
        style={{
          position: "relative",
          marginBottom: 24,
        }}
      >
        <textarea
          style={{
            width: "100%",
            minHeight: 48,
            height: newConfession.length > 50 ? "auto" : "48px",
            padding: "12px 100px 12px 16px",
            borderRadius: 24,
            border: "1px solid rgba(51, 51, 51, 0.7)",
            background: "rgba(17, 17, 17, 0.7)",
            backdropFilter: "blur(10px)",
            color: "#fff",
            fontSize: "14px",
            resize: "none",
            outline: "none",
            fontFamily: "inherit",
            overflow: newConfession.length > 50 ? "auto" : "hidden",
            transition: "height 0.2s ease",
          }}
          value={newConfession}
          onChange={(e) => setNewConfession(e.target.value)}
          placeholder="Tell us a gossip..."
          maxLength={500}
          rows={newConfession.length > 50 ? 3 : 1}
        />
        <button
          style={{
            position: "absolute",
            top: "50%",
            transform: "translateY(-50%)",
            right: "12px",
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: "#667eea",
            color: "white",
            border: "none",
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
            transition: "all 0.2s",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 0,
          }}
          onClick={handleSubmitConfession}
          disabled={loading || !newConfession.trim()}
        >
          {loading ? (
            <span style={{ fontSize: "12px" }}>...</span>
          ) : (
            <div
              style={{
                width: 0,
                height: 0,
                borderTop: "6px solid transparent",
                borderBottom: "6px solid transparent",
                borderLeft: "10px solid white",
                marginLeft: "3px",
              }}
            />
          )}
        </button>
      </div>

      {/* Confessions Feed */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {confessions.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              color: "#666",
              background: "#111",
              borderRadius: 16,
              border: "1px solid #333",
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: 16, opacity: 0.5 }}>
              💭
            </div>
            <div style={{ fontSize: "18px", marginBottom: 8, color: "#fff" }}>
              No confessions yet
            </div>
            <div style={{ fontSize: "14px" }}>
              Be the first to share a confession!
            </div>
          </div>
        ) : (
          confessions.map((confession) => (
            <div
              key={confession._id}
              style={{
                background: "rgba(17, 17, 17, 0.7)",
                backdropFilter: "blur(10px)",
                borderRadius: 16,
                padding: 24,
                border: "1px solid rgba(102, 126, 234, 0.4)",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Vibrant gradient accent */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "4px",
                  background: "linear-gradient(90deg, #667eea, #764ba2, #fc5c7d)",
                  backgroundSize: "200% 100%",
                  animation: "gradientMove 3s ease infinite",
                }}
              />

              {/* Confession Content */}
              <div style={{ marginBottom: 16, position: "relative" }}>
                <p
                  style={{
                    color: "#fff",
                    fontSize: "18px",
                    lineHeight: 1.6,
                    margin: "0 0 24px 0",
                    fontWeight: "500",
                    letterSpacing: "0.3px",
                  }}
                >
                  {confession.confession}
                </p>

                {/* Move time and comment count to bottom right */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <span
                    style={{
                      color: "rgba(255, 255, 255, 0.6)",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span role="img" aria-label="time">
                      ⏱️
                    </span>
                    {formatTime(confession.createdAt)}
                  </span>
                  <span
                    style={{
                      color: "rgba(255, 255, 255, 0.6)",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span role="img" aria-label="comments">💬</span>
                    {confession.comments.length}
                  </span>
                </div>
              </div>

              {/* Comments Section - keep the existing code but update styling */}
              {confession.comments.length > 0 && (
                <div
                  style={{
                    borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                    paddingTop: 16,
                    marginBottom: 16,
                  }}
                >
                  <h4
                    style={{
                      color: "#fff",
                      margin: "0 0 12px 0",
                      fontSize: "14px",
                      fontWeight: "600",
                    }}
                  >
                    Comments
                  </h4>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    {confession.comments.map((comment) => (
                      <div
                        key={comment.id}
                        style={{
                          background: "rgba(10, 10, 10, 0.6)",
                          borderRadius: 12,
                          padding: 12,
                          border: "1px solid rgba(102, 126, 234, 0.2)",
                          backdropFilter: "blur(5px)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 4,
                          }}
                        >
                          <span
                            style={{
                              color: "#667eea",
                              fontSize: "12px",
                              fontWeight: "600",
                            }}
                          >
                            {comment.userName}
                          </span>
                          <span
                            style={{
                              color: "rgba(255, 255, 255, 0.4)",
                              fontSize: "10px",
                            }}
                          >
                            {formatTime(comment.createdAt)}
                          </span>
                        </div>
                        <p
                          style={{
                            color: "#fff",
                            fontSize: "14px",
                            margin: 0,
                            lineHeight: 1.4,
                          }}
                        >
                          {comment.comment}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Comment button - update styling for more vibrant look */}
              {replyingTo === confession._id ? (
                <div
                  style={{
                    borderTop: "1px solid #333",
                    paddingTop: 16,
                  }}
                >
                  <textarea
                    style={{
                      width: "100%",
                      minHeight: 60,
                      padding: 12,
                      borderRadius: 8,
                      border: "1px solid #333",
                      background: "#0a0a0a",
                      color: "#fff",
                      fontSize: "14px",
                      resize: "vertical",
                      outline: "none",
                      fontFamily: "inherit",
                      marginBottom: 8,
                    }}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Write a comment..."
                    maxLength={200}
                  />
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      style={{
                        padding: "8px 16px",
                        borderRadius: 6,
                        background: "transparent",
                        color: "#888",
                        border: "1px solid #333",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                      onClick={() => {
                        setReplyingTo(null);
                        setCommentText("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      style={{
                        padding: "8px 16px",
                        borderRadius: 6,
                        background: "#0070f3",
                        color: "white",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: "600",
                      }}
                      onClick={() => handleAddComment(confession._id)}
                      disabled={!commentText.trim()}
                    >
                      Comment
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    background: "rgba(102, 126, 234, 0.2)",
                    color: "#fff",
                    border: "1px solid rgba(102, 126, 234, 0.4)",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: "600",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  onClick={() => setReplyingTo(confession._id)}
                >
                  <span role="img" aria-label="comment">💬</span> Add Comment
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
