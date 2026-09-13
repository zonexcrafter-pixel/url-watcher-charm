export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      broken_links: {
        Row: {
          anchor_text: string | null
          detected_at: string
          error_type: string
          fixed_at: string | null
          http_status: number | null
          id: string
          is_redirect: boolean
          issue_state: string
          redirect_target: string | null
          replacement_url: string | null
          scan_id: string | null
          source_url: string
          state_updated_at: string
          target_url: string
          verified_at: string | null
          verified_status: number | null
          website_id: string
        }
        Insert: {
          anchor_text?: string | null
          detected_at?: string
          error_type?: string
          fixed_at?: string | null
          http_status?: number | null
          id?: string
          is_redirect?: boolean
          issue_state?: string
          redirect_target?: string | null
          replacement_url?: string | null
          scan_id?: string | null
          source_url: string
          state_updated_at?: string
          target_url: string
          verified_at?: string | null
          verified_status?: number | null
          website_id: string
        }
        Update: {
          anchor_text?: string | null
          detected_at?: string
          error_type?: string
          fixed_at?: string | null
          http_status?: number | null
          id?: string
          is_redirect?: boolean
          issue_state?: string
          redirect_target?: string | null
          replacement_url?: string | null
          scan_id?: string | null
          source_url?: string
          state_updated_at?: string
          target_url?: string
          verified_at?: string | null
          verified_status?: number | null
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broken_links_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broken_links_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          canonical_url: string | null
          created_at: string
          error_message: string | null
          h1_count: number | null
          http_status: number | null
          id: string
          is_allowed_by_robots: boolean
          meta_description: string | null
          redirect_count: number
          redirected_to: string | null
          response_time_ms: number | null
          scan_id: string
          title: string | null
          url: string
          website_id: string
        }
        Insert: {
          canonical_url?: string | null
          created_at?: string
          error_message?: string | null
          h1_count?: number | null
          http_status?: number | null
          id?: string
          is_allowed_by_robots?: boolean
          meta_description?: string | null
          redirect_count?: number
          redirected_to?: string | null
          response_time_ms?: number | null
          scan_id: string
          title?: string | null
          url: string
          website_id: string
        }
        Update: {
          canonical_url?: string | null
          created_at?: string
          error_message?: string | null
          h1_count?: number | null
          http_status?: number | null
          id?: string
          is_allowed_by_robots?: boolean
          meta_description?: string | null
          redirect_count?: number
          redirected_to?: string | null
          response_time_ms?: number | null
          scan_id?: string
          title?: string | null
          url?: string
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pages_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      scans: {
        Row: {
          broken_count: number
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          links_checked: number
          pages_scanned: number
          seo_issue_count: number
          started_at: string
          status: string
          website_id: string
        }
        Insert: {
          broken_count?: number
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          links_checked?: number
          pages_scanned?: number
          seo_issue_count?: number
          started_at?: string
          status?: string
          website_id: string
        }
        Update: {
          broken_count?: number
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          links_checked?: number
          pages_scanned?: number
          seo_issue_count?: number
          started_at?: string
          status?: string
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scans_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_issues: {
        Row: {
          detail: string | null
          detected_at: string
          id: string
          issue_state: string
          message: string
          scan_id: string | null
          severity: string
          state_updated_at: string
          type: string
          url: string
          verified_at: string | null
          website_id: string
        }
        Insert: {
          detail?: string | null
          detected_at?: string
          id?: string
          issue_state?: string
          message: string
          scan_id?: string | null
          severity: string
          state_updated_at?: string
          type: string
          url: string
          verified_at?: string | null
          website_id: string
        }
        Update: {
          detail?: string | null
          detected_at?: string
          id?: string
          issue_state?: string
          message?: string
          scan_id?: string | null
          severity?: string
          state_updated_at?: string
          type?: string
          url?: string
          verified_at?: string | null
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_issues_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_issues_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      websites: {
        Row: {
          created_at: string
          domain: string
          id: string
          last_scanned_at: string | null
          pages_scanned: number
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          last_scanned_at?: string | null
          pages_scanned?: number
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          last_scanned_at?: string | null
          pages_scanned?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
