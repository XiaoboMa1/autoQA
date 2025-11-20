import React from "react"
import { useToast } from "../components/ui/toast"

// 创建一个类似alert的全局函数
export const showToast = (() => {
  let toast: ReturnType<typeof useToast> | null = null

  // 设置toast实例
  const setToastInstance = (instance: ReturnType<typeof useToast>) => {
    toast = instance
  }

  // 显示toast消息
  const show = (
    message: string,
    options?: {
      type?: "default" | "success" | "error" | "info" | "warning"
      duration?: number
      description?: string
      action?: React.ReactNode
    }
  ) => {
    if (!toast) {
      console.warn("Toast instance not set. Falling back to alert.")
      alert(message)
      return
    }

    const { type = "default", duration = 5000, description, action } = options || {}

    toast.addToast({
      title: message,
      description,
      action,
      type,
      duration
    })
  }

  // 成功消息
  const success = (message: string, options?: Omit<Parameters<typeof show>[1], "type">) => {
    show(message, { ...options, type: "success" })
  }

  // 错误消息
  const error = (message: string, options?: Omit<Parameters<typeof show>[1], "type">) => {
    show(message, { ...options, type: "error" })
  }

  // 警告消息
  const warning = (message: string, options?: Omit<Parameters<typeof show>[1], "type">) => {
    show(message, { ...options, type: "warning" })
  }

  // 信息消息
  const info = (message: string, options?: Omit<Parameters<typeof show>[1], "type">) => {
    show(message, { ...options, type: "info" })
  }

  return {
    setToastInstance,
    show,
    success,
    error,
    warning,
    info
  }
})()

// 创建一个React hook来设置toast实例
export function useSetupToast() {
  const toast = useToast()
  
  React.useEffect(() => {
    showToast.setToastInstance(toast)
    return () => {}
  }, [toast])
} 