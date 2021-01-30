package main

import (
	"context"
	"flag"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"time"
)

func main() {
	log.SetFlags(0)

	err := run()
	if err != nil {
		log.Fatal(err)
	}
}

// run initializes the chatServer and then
// starts a http.Server for the passed in address.
func run() error {

	addrListen := flag.String("addr", "", "please provide an address to listen on as the first argument")
	certFile := *flag.String("cert", "EMT", "enter cert file if available -cert else use empty value")
	keyFile := *flag.String("key", "EMT", "enter key file if available using -key else use empty value")
	flag.Parse()

	l, err := net.Listen("tcp", *addrListen)
	if err != nil {
		return err
	}
	log.Printf("listening on http://%v", l.Addr())

	cs := newChatServer()
	s := &http.Server{
		Handler:      cs,
		ReadTimeout:  time.Second * 10,
		WriteTimeout: time.Second * 10,
	}
	errc := make(chan error, 1)
	go func() {
		if certFile != "EMT" && certFile != "" && keyFile != "EMT" && keyFile != "" {
			errc <- s.ServeTLS(l, certFile, keyFile)
		} else {
			errc <- s.Serve(l)
		}
	}()

	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, os.Interrupt)
	select {
	case err := <-errc:
		log.Printf("failed to serve: %v", err)
	case sig := <-sigs:
		log.Printf("terminating: %v", sig)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*10)
	defer cancel()

	return s.Shutdown(ctx)
}
