package main

import (
	"context"
	"encoding/json"
	"errors"
	"io/ioutil"
	"log"
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"fmt"

	"nhooyr.io/websocket"
)

// chatServer enables broadcasting to a set of subscribers.
type chatServer struct {
	// subscriberMessageBuffer controls the max number
	// of messages that can be queued for a subscriber
	// before it is kicked.
	//
	// Defaults to 16.
	subscriberMessageBuffer int

	// publishLimiter controls the rate limit applied to the publish endpoint.
	//
	// Defaults to one publish every 100ms with a burst of 8.
	publishLimiter *rate.Limiter

	// logf controls where logs are sent.
	// Defaults to log.Printf.
	logf func(f string, v ...interface{})

	// serveMux routes the various endpoints to the appropriate handler.
	serveMux http.ServeMux

	subscribersMu sync.Mutex
	subscribers   map[*subscriber]struct{}

	allUsers map[string]*SckUser
}

type SckUserPublic struct {
	rndID string
	name  string
	info  string
}

type SckUser struct {
	RndID        string
	Name         string
	Info         string
	sendMsgsChan chan []byte
	closeSlow    func()
}

// newChatServer constructs a chatServer with the defaults.
func newChatServer() *chatServer {
	cs := &chatServer{
		subscriberMessageBuffer: 16,
		logf:                    log.Printf,
		subscribers:             make(map[*subscriber]struct{}),
		publishLimiter:          rate.NewLimiter(rate.Every(time.Millisecond*100), 8),
		allUsers:                make(map[string]*SckUser),
	}
	cs.serveMux.Handle("/", http.FileServer(http.Dir("./file")))
	cs.serveMux.HandleFunc("/register", cs.registerHandler)
	cs.serveMux.HandleFunc("/send", cs.sendHandler)
	cs.serveMux.HandleFunc("/list", cs.listHandler)

	return cs
}

// subscriber represents a subscriber.
// Messages are sent on the msgs channel and if the client
// cannot keep up with the messages, closeSlow is called.
type subscriber struct {
	msgs      chan []byte
	closeSlow func()
}

func (cs *chatServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	cs.serveMux.ServeHTTP(w, r)
}

// GetIP gets a requests IP address by reading off the forwarded-for
// header (for proxies) and falls back to use the remote address.
func GetIP(r *http.Request) string {
	forwarded := r.Header.Get("X-FORWARDED-FOR")
	if forwarded != "" {
		return forwarded
	}
	return r.RemoteAddr
}

// subscribeHandler accepts the WebSocket connection and then subscribes
// it to all future messages.
func (cs *chatServer) registerHandler(w http.ResponseWriter, r *http.Request) {
	c, err := websocket.Accept(w, r, nil)
	if err != nil {
		cs.logf("%v", err)
		return
	}
	defer c.Close(websocket.StatusInternalError, "")

	queryVals := r.URL.Query()
	sckUserPublic := SckUserPublic{
		rndID: queryVals["rndID"][0],
		name:  queryVals["name"][0],
		info:  "",
	}

	fmt.Println(GetIP(r), sckUserPublic)

	err = cs.subscribe(r.Context(), c, &sckUserPublic)

	fmt.Println("DONE ON SUB HANDLER")
	if errors.Is(err, context.Canceled) {
		return
	}
	if websocket.CloseStatus(err) == websocket.StatusNormalClosure ||
		websocket.CloseStatus(err) == websocket.StatusGoingAway {
		return
	}
	if err != nil {
		cs.logf("%v", err)
		return
	}
}

// publishHandler reads the request body with a limit of 8192 bytes and then publishes
// the received message.
func (cs *chatServer) publishHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
		return
	}
	body := http.MaxBytesReader(w, r.Body, 8192)
	msg, err := ioutil.ReadAll(body)
	if err != nil {
		http.Error(w, http.StatusText(http.StatusRequestEntityTooLarge), http.StatusRequestEntityTooLarge)
		return
	}

	cs.publish(msg)

	w.WriteHeader(http.StatusAccepted)
}

type SendMsgBody struct {
	RndID   string
	Message string
}

// publishHandler reads the request body with a limit of 8192 bytes and then publishes
// the received message.
func (cs *chatServer) sendHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
		return
	}

	var sendMsg SendMsgBody

	//body, _ := ioutil.ReadAll(r.Body)
	//fmt.Println("body", body)

	err := json.NewDecoder(r.Body).Decode(&sendMsg)
	if err != nil {
		fmt.Println("decode body error", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	fmt.Println("SEND MSG", sendMsg)

	cs.allUsers[sendMsg.RndID].sendMsgsChan <- []byte(sendMsg.Message)

	w.WriteHeader(http.StatusAccepted)
}

func (cs *chatServer) sendRefreshToAll() {
	for _, v := range cs.allUsers {
		v.sendMsgsChan <- []byte("refresh")
	}
}

func (cs *chatServer) listHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
		return
	}

	js, _ := json.Marshal(cs.allUsers)
	//fmt.Println(string(js), cs.allUsers)
	w.Header().Set("Content-Type", "application/json")
	w.Write(js)
}

// subscribe subscribes the given WebSocket to all broadcast messages.
// It creates a subscriber with a buffered msgs chan to give some room to slower
// connections and then registers the subscriber. It then listens for all messages
// and writes them to the WebSocket. If the context is cancelled or
// an error occurs, it returns and deletes the subscription.
//
// It uses CloseRead to keep reading from the connection to process control
// messages and cancel the context if the connection drops.
func (cs *chatServer) subscribe(ctx context.Context, c *websocket.Conn, sckUserPublic *SckUserPublic) error {
	ctx = c.CloseRead(ctx)

	s := &subscriber{
		msgs: make(chan []byte, cs.subscriberMessageBuffer),
		closeSlow: func() {
			c.Close(websocket.StatusPolicyViolation, "connection too slow to keep up with messages")
		},
	}

	sckUser := &SckUser{
		RndID:        sckUserPublic.rndID,
		Name:         sckUserPublic.name,
		Info:         sckUserPublic.info,
		sendMsgsChan: make(chan []byte, cs.subscriberMessageBuffer),
		closeSlow: func() {
			c.Close(websocket.StatusPolicyViolation, "connection too slow to keep up with messages")
		},
	}

	tmp, _ := json.Marshal(sckUser)
	fmt.Println("subscript new user", sckUser, string(tmp))

	cs.addSubscriber(s, sckUser)
	defer cs.deleteSubscriber(s, sckUser.RndID)
	defer cs.sendRefreshToAll()

	cs.sendRefreshToAll()

	for {
		select {
		case msg := <-s.msgs:
			err := writeTimeout(ctx, time.Second*5, c, msg)
			if err != nil {
				return err
			}
		case msg2 := <-sckUser.sendMsgsChan:
			err := writeTimeout(ctx, time.Second*5, c, msg2)
			if err != nil {
				return err
			}
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

// publish publishes the msg to all subscribers.
// It never blocks and so messages to slow subscribers
// are dropped.
func (cs *chatServer) publish(msg []byte) {
	cs.subscribersMu.Lock()
	defer cs.subscribersMu.Unlock()

	cs.publishLimiter.Wait(context.Background())

	for s := range cs.subscribers {
		select {
		case s.msgs <- msg:
		default:
			go s.closeSlow()
		}
	}
}

// addSubscriber registers a subscriber.
func (cs *chatServer) addSubscriber(s *subscriber, sckUser *SckUser) {
	cs.subscribersMu.Lock()
	cs.allUsers[sckUser.RndID] = sckUser
	cs.subscribers[s] = struct{}{}
	cs.subscribersMu.Unlock()
}

// deleteSubscriber deletes the given subscriber.
func (cs *chatServer) deleteSubscriber(s *subscriber, rndID string) {
	cs.subscribersMu.Lock()
	delete(cs.subscribers, s)
	delete(cs.allUsers, rndID)
	cs.subscribersMu.Unlock()
}

func writeTimeout(ctx context.Context, timeout time.Duration, c *websocket.Conn, msg []byte) error {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	return c.Write(ctx, websocket.MessageText, msg)
}
