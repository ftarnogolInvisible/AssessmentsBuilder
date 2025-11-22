import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, CheckCircle, UserPlus, Mail, Trash2, Edit2, Shield, Eye, FileText, Folder, FolderTree } from "lucide-react";
import type { User, Campaign, Project, Assessment } from "@shared/schema";

interface UserManagementModalProps {
  onClose: () => void;
}

interface UserWithRole extends Omit<User, "password"> {
  clientRole: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

const PERMISSION_LABELS: Record<string, string> = {
  view: "View",
  edit: "Edit",
  review: "Review",
};

export default function UserManagementModal({ onClose }: UserManagementModalProps) {
  const [activeTab, setActiveTab] = useState<"users" | "invites">("users");
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [showPermissions, setShowPermissions] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const [inviteForm, setInviteForm] = useState({
    email: "",
    role: "viewer",
  });

  const [userForm, setUserForm] = useState({
    email: "",
    username: "",
    firstName: "",
    lastName: "",
    role: "viewer",
    password: "",
  });

  const queryClient = useQueryClient();

  // Fetch users
  const { data: users = [], isLoading: usersLoading } = useQuery<UserWithRole[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  // Fetch campaigns, projects, assessments for permissions
  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/campaigns", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Fetch invites
  const { data: invites = [], isLoading: invitesLoading } = useQuery({
    queryKey: ["user-invites"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/user-invites", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Create invite mutation
  const createInvite = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/user-invites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create invite");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-invites"] });
      setShowInviteForm(false);
      setInviteForm({ email: "", role: "viewer" });
      setSuccessMessage("Invite sent successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    },
    onError: (error) => {
      alert(`Failed to send invite: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  // Create user mutation
  const createUser = useMutation({
    mutationFn: async (data: typeof userForm) => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowUserForm(false);
      setUserForm({ email: "", username: "", firstName: "", lastName: "", role: "viewer", password: "" });
      setSuccessMessage("User created successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    },
    onError: (error) => {
      alert(`Failed to create user: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  // Update user mutation
  const updateUser = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof userForm> }) => {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditingUser(null);
      setUserForm({ email: "", username: "", firstName: "", lastName: "", role: "viewer", password: "" });
      setSuccessMessage("User updated successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    },
    onError: (error) => {
      alert(`Failed to update user: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  // Delete user mutation
  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setSuccessMessage("User removed successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    },
    onError: (error) => {
      alert(`Failed to remove user: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  // Delete invite mutation
  const deleteInvite = useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/user-invites/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete invite");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-invites"] });
      setSuccessMessage("Invite cancelled successfully!");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    },
    onError: (error) => {
      alert(`Failed to cancel invite: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  const handleEditUser = (user: UserWithRole) => {
    setEditingUser(user);
    setUserForm({
      email: user.email,
      username: user.username || "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      role: user.clientRole,
      password: "",
    });
    setShowUserForm(true);
  };

  const handleSaveUser = () => {
    if (editingUser) {
      updateUser.mutate({ id: editingUser.id, data: userForm });
    } else {
      createUser.mutate(userForm);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">User Management</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-4 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("users")}
              className={`pb-2 px-1 text-sm font-medium transition-colors ${
                activeTab === "users"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Users ({users.length})
            </button>
            <button
              onClick={() => setActiveTab("invites")}
              className={`pb-2 px-1 text-sm font-medium transition-colors ${
                activeTab === "invites"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Invites ({invites.filter((i: any) => !i.acceptedAt).length})
            </button>
          </div>
        </div>

        {showSuccess && (
          <div className="mx-6 mt-4 flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm font-medium text-green-900">{successMessage}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "users" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-md font-semibold text-gray-900">All Users</h4>
                <button
                  onClick={() => {
                    setEditingUser(null);
                    setUserForm({ email: "", username: "", firstName: "", lastName: "", role: "viewer", password: "" });
                    setShowUserForm(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  <UserPlus className="w-4 h-4" />
                  Add User
                </button>
              </div>

              {showUserForm && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h5 className="font-medium text-gray-900 mb-4">
                    {editingUser ? "Edit User" : "Create New User"}
                  </h5>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                      <input
                        type="email"
                        value={userForm.email}
                        onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        disabled={!!editingUser}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                      <input
                        type="text"
                        value={userForm.username}
                        onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        disabled={!!editingUser}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                      <input
                        type="text"
                        value={userForm.firstName}
                        onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                      <input
                        type="text"
                        value={userForm.lastName}
                        onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                      <select
                        value={userForm.role}
                        onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {!editingUser && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                        <input
                          type="password"
                          value={userForm.password}
                          onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                    )}
                    {editingUser && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">New Password (optional)</label>
                        <input
                          type="password"
                          value={userForm.password}
                          onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="Leave empty to keep current password"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={handleSaveUser}
                      disabled={createUser.isPending || updateUser.isPending}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                    >
                      {createUser.isPending || updateUser.isPending ? "Saving..." : editingUser ? "Update" : "Create"}
                    </button>
                    <button
                      onClick={() => {
                        setShowUserForm(false);
                        setEditingUser(null);
                        setUserForm({ email: "", username: "", firstName: "", lastName: "", role: "viewer", password: "" });
                      }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {usersLoading ? (
                <p className="text-gray-500 text-center py-8">Loading users...</p>
              ) : users.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No users found</p>
              ) : (
                <div className="space-y-2">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                              {user.avatarUrl ? (
                                <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
                              ) : (
                                <span className="text-blue-600 font-medium">
                                  {user.firstName?.[0] || user.email[0].toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">
                                {user.firstName && user.lastName
                                  ? `${user.firstName} ${user.lastName}`
                                  : user.username}
                              </div>
                              <div className="text-sm text-gray-500">{user.email}</div>
                            </div>
                            <span className={`px-2 py-1 text-xs font-medium rounded ${
                              user.clientRole === "owner" ? "bg-purple-100 text-purple-700" :
                              user.clientRole === "admin" ? "bg-red-100 text-red-700" :
                              user.clientRole === "editor" ? "bg-blue-100 text-blue-700" :
                              "bg-gray-100 text-gray-700"
                            }`}>
                              {ROLE_LABELS[user.clientRole] || user.clientRole}
                            </span>
                            {!user.active && (
                              <span className="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-700">
                                Inactive
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditUser(user)}
                            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Edit user"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to remove ${user.email}?`)) {
                                deleteUser.mutate(user.id);
                              }
                            }}
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Remove user"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "invites" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-md font-semibold text-gray-900">Pending Invites</h4>
                <button
                  onClick={() => setShowInviteForm(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  <Mail className="w-4 h-4" />
                  Send Invite
                </button>
              </div>

              {showInviteForm && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h5 className="font-medium text-gray-900 mb-4">Send Email Invite</h5>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                      <input
                        type="email"
                        value={inviteForm.email}
                        onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="user@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                      <select
                        value={inviteForm.role}
                        onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => createInvite.mutate(inviteForm)}
                      disabled={createInvite.isPending || !inviteForm.email}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                    >
                      {createInvite.isPending ? "Sending..." : "Send Invite"}
                    </button>
                    <button
                      onClick={() => {
                        setShowInviteForm(false);
                        setInviteForm({ email: "", role: "viewer" });
                      }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {invitesLoading ? (
                <p className="text-gray-500 text-center py-8">Loading invites...</p>
              ) : invites.filter((i: any) => !i.acceptedAt).length === 0 ? (
                <p className="text-gray-500 text-center py-8">No pending invites</p>
              ) : (
                <div className="space-y-2">
                  {invites
                    .filter((invite: any) => !invite.acceptedAt)
                    .map((invite: any) => (
                      <div
                        key={invite.id}
                        className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-gray-900">{invite.email}</div>
                            <div className="text-sm text-gray-500">
                              Invited {new Date(invite.createdAt).toLocaleDateString()} • Expires{" "}
                              {new Date(invite.expiresAt).toLocaleDateString()}
                            </div>
                            <span className={`inline-block mt-1 px-2 py-1 text-xs font-medium rounded ${
                              invite.role === "owner" ? "bg-purple-100 text-purple-700" :
                              invite.role === "admin" ? "bg-red-100 text-red-700" :
                              invite.role === "editor" ? "bg-blue-100 text-blue-700" :
                              "bg-gray-100 text-gray-700"
                            }`}>
                              {ROLE_LABELS[invite.role] || invite.role}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              if (confirm(`Cancel invite for ${invite.email}?`)) {
                                deleteInvite.mutate(invite.id);
                              }
                            }}
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Cancel invite"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

