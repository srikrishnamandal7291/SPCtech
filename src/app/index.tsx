import { useCameraPermissions } from 'expo-camera';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
Notifications.setNotificationHandler({

  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
Notifications.setNotificationCategoryAsync(
  'SHIFT_END',
  [
    {
      identifier: 'CONTINUE_OVERTIME',
      buttonTitle: 'Continue Overtime',
    },
    {
      identifier: 'END_WORK',
      buttonTitle: 'End Work',
    },
  ]
);
const LOGIN_URL = 'https://comw.tzweb.in/admin/login';

const USERNAME_KEY = 'spctech_username';
const PASSWORD_KEY = 'spctech_password';

export default function HomeScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [showLoader, setShowLoader] = useState(false);

  const webViewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);
  const navigationStarted = useRef(false);
  const shiftNotificationId = useRef<string | null>(null);
  const pendingNotificationAction = useRef<string | null>(null);
  const expoPushTokenRef = useRef<string | null>(null);
  // Prevent automatic login from running repeatedly
  const autoLoginStarted = useRef(false);

  // Temporarily keeps credentials entered during this login attempt
  const pendingCredentials = useRef<{
    username: string;
    password: string;
  } | null>(null);

  // --------------------------------------------------
  // CAMERA PERMISSION
  // --------------------------------------------------
  useEffect(() => {
    if (Platform.OS === 'android' && permission && !permission.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);
  const registerForPushNotificationsAsync = async () => {
    try {
      if (Platform.OS !== 'android') {
        return null;
      }

      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();

      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } =
          await Notifications.requestPermissionsAsync();

        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Push notification permission not granted.');
        return null;
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        Constants.easConfig?.projectId;

      if (!projectId) {
        console.log('Expo projectId not found.');
        return null;
      }

      const tokenResponse =
        await Notifications.getExpoPushTokenAsync({
          projectId,
        });
      const token = tokenResponse.data;
      // Save Expo Push Token to Laravel
      expoPushTokenRef.current = token;

      console.log('Expo Push Token:', token);
      return token;

    } catch (error) {
      console.log('Push token registration error:', error);
      return null;
    }
  };
  // --------------------------------------------------
  // NOTIFICATION PERMISSION
  // --------------------------------------------------

  useEffect(() => {
    const setupNotifications = async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('attendance', {
          name: 'SP COMPUTER Attendance',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          lockscreenVisibility:
            Notifications.AndroidNotificationVisibility.PUBLIC,
        });
      }

      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();

      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } =
          await Notifications.requestPermissionsAsync();

        finalStatus = status;
      }

      console.log(
        'Notification permission:',
        finalStatus
      );
      if (finalStatus === 'granted') {
        console.log('Notification permission granted.');

        const pushToken =
          await registerForPushNotificationsAsync();

        console.log('Push Token:', pushToken);
      }
    };

    setupNotifications();
  }, []);


  // --------------------------------------------------
  // NOTIFICATION RESPONSE
  // --------------------------------------------------

  useEffect(() => {

    const subscription =
      Notifications.addNotificationResponseReceivedListener(
        (response) => {

          const actionIdentifier =
            response.actionIdentifier;

          console.log(
            'Notification action:',
            actionIdentifier
          );

          if (
            actionIdentifier ===
            'CONTINUE_OVERTIME'
          ) {

            pendingNotificationAction.current =
              'CONTINUE_OVERTIME';

            console.log(
              'Continue Overtime action received.'
            );
          }

        }
      );

    return () => {
      subscription.remove();
    };

  }, []);

  // --------------------------------------------------
  // CHECK LAST NOTIFICATION RESPONSE
  // --------------------------------------------------

  useEffect(() => {

    const checkLastNotificationResponse = async () => {

      try {

        const response =
          await Notifications.getLastNotificationResponseAsync();

        if (!response) {
          return;
        }

        const actionIdentifier =
          response.actionIdentifier;

        console.log(
          'Last notification action:',
          actionIdentifier
        );

        if (
          actionIdentifier ===
          'CONTINUE_OVERTIME'
        ) {

          pendingNotificationAction.current =
            'CONTINUE_OVERTIME';

          console.log(
            'Pending Continue Overtime action restored.'
          );
        }

      } catch (error) {

        console.log(
          'Notification response check error:',
          error
        );

      }

    };

    checkLastNotificationResponse();

  }, []);

  // --------------------------------------------------
  // TEST NOTIFICATION
  // --------------------------------------------------

  const testNotification = async () => {

    await Notifications.scheduleNotificationAsync({
      // content: {
      //   title: 'SP COMPUTER',
      //   body: 'Notification system is working successfully.',
      //   sound: 'default',
      // },
      content: {
        title: 'SP COMPUTER',
        body:
          'Your Shift has ended at 9:30 PM.\n' +
          'Do you want to continue working as Overtime?',
        sound: 'default',
        categoryIdentifier: 'SHIFT_END',
      },
      trigger: {
        seconds: 10,
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      },
    });
  };
  // --------------------------------------------------
  // ANDROID BACK BUTTON
  // --------------------------------------------------
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (canGoBackRef.current) {
          webViewRef.current?.goBack();
          return true;
        }

        return false;
      }
    );

    return () => {
      backHandler.remove();
    };
  }, []);

  // --------------------------------------------------
  // SAVE CREDENTIALS SECURELY
  // --------------------------------------------------
  const saveCredentials = async (
    username: string,
    password: string
  ) => {
    if (!username || !password) {
      return;
    }

    try {
      await SecureStore.setItemAsync(
        USERNAME_KEY,
        username
      );

      await SecureStore.setItemAsync(
        PASSWORD_KEY,
        password
      );

      console.log('Technician credentials saved securely.');
    } catch (error) {
      console.log(
        'Failed to save credentials:',
        error
      );
    }
  };

  // --------------------------------------------------
  // LOAD SAVED CREDENTIALS
  // --------------------------------------------------
  const autoLogin = async () => {
    if (autoLoginStarted.current) {
      return;
    }

    try {
      const username = await SecureStore.getItemAsync(
        USERNAME_KEY
      );

      const password = await SecureStore.getItemAsync(
        PASSWORD_KEY
      );

      if (!username || !password) {
        console.log('No saved credentials.');
        return;
      }

      autoLoginStarted.current = true;

      setShowLoader(true);

      const loginScript = `
      (function() {

        var attempts = 0;
        var maxAttempts = 50;

        function tryLogin() {

          attempts++;

          var usernameInput =
            document.getElementById('username');

          var passwordInput =
            document.querySelector(
              'input[name="password"]'
            );

          var loginForm =
            document.getElementById('login-form');

          var jq =
            window.jQuery;

          /*
           * Check that:
           * 1. Form exists
           * 2. Inputs exist
           * 3. jQuery exists
           * 4. Laravel login AJAX submit handler exists
           */
          var eventsReady = false;

          if (
            jq &&
            loginForm &&
            jq._data
          ) {

            var events =
              jq._data(
                loginForm,
                'events'
              );

            if (
              events &&
              events.submit &&
              events.submit.length > 0
            ) {
              eventsReady = true;
            }
          }

          if (
            usernameInput &&
            passwordInput &&
            loginForm &&
            jq &&
            eventsReady
          ) {

            console.log(
              'SPCTech: Laravel AJAX handler ready'
            );

            usernameInput.value =
              ${JSON.stringify(username)};

            passwordInput.value =
              ${JSON.stringify(password)};

            usernameInput.dispatchEvent(
              new Event(
                'input',
                { bubbles: true }
              )
            );

            usernameInput.dispatchEvent(
              new Event(
                'change',
                { bubbles: true }
              )
            );

            passwordInput.dispatchEvent(
              new Event(
                'input',
                { bubbles: true }
              )
            );

            passwordInput.dispatchEvent(
              new Event(
                'change',
                { bubbles: true }
              )
            );

            window.ReactNativeWebView.postMessage(
              JSON.stringify({
                type: 'AUTO_LOGIN_STARTED'
              })
            );

            /*
             * IMPORTANT:
             * Trigger jQuery submit handler.
             */
            jq(loginForm).trigger('submit');

            return;
          }

          if (attempts < maxAttempts) {

            setTimeout(
              tryLogin,
              300
            );

          } else {

            window.ReactNativeWebView.postMessage(
              JSON.stringify({
                type: 'AUTO_LOGIN_ERROR',
                message:
                  'Laravel AJAX login handler not ready'
              })
            );
          }
        }

        tryLogin();

      })();

      true;
    `;

      webViewRef.current?.injectJavaScript(
        loginScript
      );

    } catch (error) {

      console.log(
        'Automatic login error:',
        error
      );

      autoLoginStarted.current = false;
      setShowLoader(false);
    }
  };

  // --------------------------------------------------
  // CAPTURE LOGIN CREDENTIALS
  // --------------------------------------------------
  const attachLoginCapture = () => {
    const script = `
      (function() {

        var form = document.getElementById('login-form');

        if (!form) {
          return;
        }

        if (form.dataset.spctechCaptureAttached === '1') {
          return;
        }

        form.dataset.spctechCaptureAttached = '1';

        form.addEventListener(
          'submit',
          function() {

            var usernameInput =
              document.getElementById('username');

            var passwordInput =
              document.querySelector(
                'input[name="password"]'
              );

            if (
              usernameInput &&
              passwordInput
            ) {

              window.ReactNativeWebView.postMessage(
                JSON.stringify({
                  type: 'LOGIN_ATTEMPT',
                  username: usernameInput.value,
                  password: passwordInput.value
                })
              );

            }

          },
          true
        );

      })();

      true;
    `;

    webViewRef.current?.injectJavaScript(script);
  };

  // --------------------------------------------------
  // WEBVIEW MESSAGES
  // --------------------------------------------------
  const handleWebViewMessage = async (
    event: any
  ) => {
    try {
      const message = JSON.parse(
        event.nativeEvent.data
      );

      console.log(
        'WebView message:',
        message
      );

      // Technician clicked Log In
      if (message.type === 'LOGIN_ATTEMPT') {

        pendingCredentials.current = {
          username: message.username,
          password: message.password,
        };

        console.log(
          'Login credentials captured temporarily.'
        );
      }

      // Automatic login started
      if (
        message.type === 'AUTO_LOGIN_STARTED'
      ) {
        setShowLoader(true);
      }

      // Automatic login error
      if (
        message.type === 'AUTO_LOGIN_ERROR'
      ) {
        console.log(
          'Automatic login error:',
          message.message
        );

        setShowLoader(false);
      }

      // PUSH TOKEN SAVE RESULT
      if (
        message.type === 'PUSH_TOKEN_SAVE_RESULT'
      ) {

        console.log(
          'Push Token Save Result:',
          message
        );

        if (message.success) {

          console.log(
            '✅ REAL EXPO PUSH TOKEN SAVED TO LARAVEL.'
          );

        } else {

          console.log(
            '❌ PUSH TOKEN SAVE FAILED:',
            message.data || message.message
          );

        }
      }


      // Attendance status from Laravel WebView
      if (
        message.type === 'ATTENDANCE_STATUS'
      ) {

        console.log(
          'Attendance Shift Active:',
          message.shiftActive
        );

        if (message.shiftActive === true) {

          await scheduleShiftEndNotification();

        }

        if (message.shiftActive === false) {

          await cancelShiftEndNotification();

        }
      }

      if (
        message.type === 'CONTINUE_OVERTIME_RESULT'
      ) {

        console.log(
          'Continue Overtime Result:',
          message
        );

        if (message.success) {

          console.log(
            'Overtime started successfully.'
          );

          webViewRef.current?.injectJavaScript(`
            if (typeof loadAttendanceStatus === 'function') {
                loadAttendanceStatus();
            }

            if (typeof loadTodaySessions === 'function') {
                loadTodaySessions();
            }

            true;
        `);

        } else {

          console.log(
            'Continue Overtime failed:',
            message.data || message.message
          );
        }
      }
    } catch (error) {
      console.log(
        'WebView message error:',
        error
      );
    }
  };


  const scheduleShiftEndNotification = async () => {
    try {
      const now = new Date();

      const notificationTime = new Date();

      notificationTime.setHours(
        21,
        30,
        0,
        0
      );

      // 9:30 PM already passed
      if (notificationTime.getTime() <= now.getTime()) {
        console.log(
          '9:30 PM already passed. No notification scheduled.'
        );
        return;
      }
      if (shiftNotificationId.current) {
        await Notifications.cancelScheduledNotificationAsync(
          shiftNotificationId.current
        );

        shiftNotificationId.current = null;
      }
      const notificationId =
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'SP COMPUTER',
            body:
              'Your Shift has ended at 9:30 PM.\n' +
              'Do you want to continue working as Overtime?',
            sound: 'default',
            categoryIdentifier: 'SHIFT_END',
          },

          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: notificationTime,
          },
        });
      shiftNotificationId.current = notificationId;
      console.log(
        'Shift notification scheduled:',
        notificationId
      );

    } catch (error) {

      console.log(
        'Shift notification scheduling error:',
        error
      );
    }
  };
  // --------------------------------------------------
  // PROCESS PENDING NOTIFICATION ACTION
  // --------------------------------------------------

  const processPendingNotificationAction = () => {

    if (
      pendingNotificationAction.current !==
      'CONTINUE_OVERTIME'
    ) {
      return;
    }

    if (!webViewRef.current) {
      console.log('WebView is not ready.');
      return;
    }

    const now = new Date();

    const target = new Date();

    // OT starts at exactly 9:31:00 PM
    target.setHours(21, 31, 0, 0);

    /*
    |--------------------------------------------------------------------------
    | If it is already 9:31 PM or later
    |--------------------------------------------------------------------------
    */

    if (now.getTime() >= target.getTime()) {

      continueOvertimeRequest();

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Continue was pressed at 9:30 PM
    | Wait until exactly 9:31:00 PM
    |--------------------------------------------------------------------------
    */

    const waitMilliseconds =
      target.getTime() - now.getTime();

    console.log(
      'Continue Overtime selected. Waiting until 9:31:00 PM...',
      waitMilliseconds
    );

    setTimeout(() => {

      if (
        pendingNotificationAction.current !==
        'CONTINUE_OVERTIME'
      ) {
        return;
      }

      continueOvertimeRequest();

    }, waitMilliseconds);
  };
  const continueOvertimeRequest = () => {

    if (!webViewRef.current) {
      console.log('WebView is not ready.');
      return;
    }

    console.log(
      'Sending Continue Overtime request to Laravel...'
    );

    const script = `
    (async function () {

      try {

        const csrfElement =
          document.querySelector(
            'meta[name="csrf-token"]'
          );

        if (!csrfElement) {

          window.ReactNativeWebView.postMessage(
            JSON.stringify({
              type: 'CONTINUE_OVERTIME_RESULT',
              success: false,
              message: 'CSRF token not found.'
            })
          );

          return;
        }

        const csrfToken =
          csrfElement.getAttribute('content');

        const response = await fetch(
          '/admin/attendance/continue-overtime/v1',
          {
            method: 'POST',

            headers: {
              'Accept': 'application/json',
              'X-CSRF-TOKEN': csrfToken
            },

            credentials: 'include'
          }
        );

        const data = await response.json();

        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: 'CONTINUE_OVERTIME_RESULT',
            success:
              response.ok &&
              data.status === true,
            data: data
          })
        );

      } catch (error) {

        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: 'CONTINUE_OVERTIME_RESULT',
            success: false,
            message: error.message
          })
        );

      }

    })();

    true;
  `;

    webViewRef.current.injectJavaScript(script);

    pendingNotificationAction.current = null;
  };
  const cancelShiftEndNotification = async () => {
    try {
      if (!shiftNotificationId.current) {
        return;
      }

      await Notifications.cancelScheduledNotificationAsync(
        shiftNotificationId.current
      );

      console.log(
        'Shift end notification cancelled:',
        shiftNotificationId.current
      );

      shiftNotificationId.current = null;

    } catch (error) {
      console.log(
        'Shift notification cancellation error:',
        error
      );
    }
  };



  const savePushTokenAfterLogin = async () => {
    try {
      let token = expoPushTokenRef.current;

      // If token is not ready yet, get it now.
      if (!token) {
        token = await registerForPushNotificationsAsync();
      }

      if (!token) {
        console.log('❌ Expo Push Token not available.');
        return;
      }

      console.log(
        'Saving Expo Push Token through authenticated WebView...'
      );

      const script = `
            (async function () {
                try {

                    const csrfElement =
                        document.querySelector(
                            'meta[name="csrf-token"]'
                        );

                    if (!csrfElement) {
                        window.ReactNativeWebView.postMessage(
                            JSON.stringify({
                                type: 'PUSH_TOKEN_SAVE_RESULT',
                                success: false,
                                message: 'CSRF token not found.'
                            })
                        );

                        return;
                    }

                    const csrfToken =
                        csrfElement.getAttribute('content');

                    const response = await fetch(
                        '/admin/attendance/push-token/v1',
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Accept': 'application/json',
                                'X-CSRF-TOKEN': csrfToken
                            },
                            credentials: 'include',
                            body: JSON.stringify({
                                push_token: ${JSON.stringify(token)},
                                device_type: 'android'
                            })
                        }
                    );

                    const data = await response.json();

                    window.ReactNativeWebView.postMessage(
                        JSON.stringify({
                            type: 'PUSH_TOKEN_SAVE_RESULT',
                            success:
                                response.ok &&
                                data.status === true,
                            data: data
                        })
                    );

                } catch (error) {

                    window.ReactNativeWebView.postMessage(
                        JSON.stringify({
                            type: 'PUSH_TOKEN_SAVE_RESULT',
                            success: false,
                            message: error.message
                        })
                    );

                }
            })();

            true;
        `;

      webViewRef.current?.injectJavaScript(script);

    } catch (error) {

      console.log(
        '❌ Push token save error:',
        error
      );
    }
  };
  // --------------------------------------------------
  // WEBVIEW NAVIGATION
  // --------------------------------------------------
  const handleNavigationStateChange = async (
    navState: any
  ) => {

    const url = navState.url;

    // Back button state
    canGoBackRef.current =
      navState.canGoBack;

    // Normal page navigation loader
    if (navState.loading) {

      if (!navigationStarted.current) {
        navigationStarted.current = true;
        setShowLoader(true);
      }

    } else {

      navigationStarted.current = false;
      setShowLoader(false);
    }

    // ------------------------------------------------
    // LOGIN PAGE
    // ------------------------------------------------
    if (
      url.includes('/admin/login')
    ) {

      // Attach credential capture
      setTimeout(() => {
        attachLoginCapture();
      }, 500);

      // Try automatic login only once
      if (!autoLoginStarted.current) {

        setTimeout(() => {
          autoLogin();
        }, 800);
      }
    }

    // ------------------------------------------------
    // DASHBOARD = LOGIN SUCCESS
    // ------------------------------------------------
    if (
      url.includes('/admin/dashboard')
    ) {

      console.log(
        'Dashboard detected.'
      );

      setShowLoader(false);
      setTimeout(() => {
        savePushTokenAfterLogin();
      }, 1500);
      // Process pending notification action
      setTimeout(() => {
        processPendingNotificationAction();
      }, 800);
      // Save credentials captured BEFORE login
      if (
        pendingCredentials.current
      ) {

        const {
          username,
          password,
        } = pendingCredentials.current;

        await saveCredentials(
          username,
          password
        );

        // Clear temporary credentials
        pendingCredentials.current = null;

        console.log(
          'Login credentials saved successfully.'
        );
      }
    }
  };

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'bottom']}
    >
      <View style={styles.container}>

        <WebView
          ref={webViewRef}

          source={{
            uri: LOGIN_URL,
          }}

          style={styles.webview}

          javaScriptEnabled={true}
          domStorageEnabled={true}

          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}

          cacheEnabled={true}
          incognito={false}

          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback={true}

          onMessage={
            handleWebViewMessage
          }

          onNavigationStateChange={
            handleNavigationStateChange
          }

          onPermissionRequest={(event) => {

            const resources =
              event.nativeEvent.resources;

            console.log(
              'WebView permission request:',
              resources
            );

            if (
              resources.includes(
                'android.webkit.resource.VIDEO_CAPTURE'
              )
            ) {

              event.nativeEvent.grant(
                resources
              );
            }
          }}
        />

        {showLoader && (
          <View style={styles.loaderOverlay}>

            <View style={styles.loaderContent}>

              <Image
                source={require('@/assets/images/icon.png')}
                style={styles.logo}
                resizeMode="contain"
              />

              <Text style={styles.title}>
                SP COMPUTER
              </Text>

              <ActivityIndicator
                size="large"
                style={styles.spinner}
              />

              <Text style={styles.loadingText}>
                Loading...
              </Text>

            </View>

          </View>
        )}

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  safeArea: {
    flex: 1,
  },

  container: {
    flex: 1,
    position: 'relative',
  },

  webview: {
    flex: 1,
  },

  loaderOverlay: {
    position: 'absolute',

    top: 0,
    left: 0,
    right: 0,
    bottom: 0,

    backgroundColor:
      'rgba(255, 255, 255, 0.94)',

    alignItems: 'center',
    justifyContent: 'center',

    zIndex: 9999,
    elevation: 9999,
  },

  loaderContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  logo: {
    width: 90,
    height: 90,
    marginBottom: 12,
  },

  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 20,
  },

  spinner: {
    marginBottom: 10,
  },

  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },

});